import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Use Service Role to bypass RLS for updates
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const smtpPort = Number(process.env.SMTP_PORT) || 2525;
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.smtp2go.com',
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        let payloadData = body;

        // RETRY MODE: If applicationId is provided but no other data, fetch from DB
        if (body.applicationId && !body.email) {
            console.log("Retry mode detected for:", body.applicationId);
            const { data: appData, error: fetchError } = await supabase
                .from('applications')
                .select('*')
                .eq('id', body.applicationId)
                .single();

            if (fetchError || !appData) {
                return NextResponse.json({ error: "Application not found" }, { status: 404 });
            }

            // Map DB fields to Paylod
            payloadData = {
                campaignCode: appData.campaign_code,
                email: appData.email,
                phone: appData.phone,
                city: appData.city,
                zipCode: appData.post_code,
                childName: appData.child_name,
                lastName: appData.last_name,
                image_url: appData.image_url,
                firstName: appData.first_name,
                age: appData.age,
                gender: appData.gender,
                applicationId: appData.id
            }
        }

        // Map the incoming data to the CRM expected format
        const payload = {
            campaign: payloadData.campaignCode || '',
            email: payloadData.email || '',
            telephone: payloadData.phone || '',
            address: `${payloadData.city || ''}, ${payloadData.zipCode || ''}`,
            firstname: payloadData.childName || '', // Mapping Child Name to firstname
            lastname: payloadData.lastName || '',
            image: payloadData.image_url || '',
            analyticsid: payloadData.firstName || '', // Mapping Parent First Name to analyticsid
            age: payloadData.age ? String(payloadData.age) : '',
            gender: payloadData.gender || '',
            opt_in: "1"
        };

        console.log("Sending payload to CRM:", payload);

        const response = await fetch('https://www.thestudiobookings.online/application/lead/service/importlead-api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        let crmStatus = 'failed';
        let crmResponse = '';

        if (!response.ok) {
            const errorText = await response.text();
            console.error("CRM Webhook Error:", response.status, errorText);
            crmResponse = `Error ${response.status}: ${errorText.substring(0, 200)}`;
        } else {
            const responseData = await response.text(); // PHP might return text or JSON
            crmStatus = 'success';
            crmResponse = responseData.substring(0, 200);
        }

        // Update Supabase if we have an ID
        if (payloadData.applicationId) {
            await supabase
                .from('applications')
                .update({
                    crm_status: crmStatus,
                    crm_response: crmResponse
                })
                .eq('id', payloadData.applicationId);
        }

        if (crmStatus === 'failed') {
            return NextResponse.json({ error: "Failed to send to CRM", details: crmResponse }, { status: 400 });
        }

        // Send Email Notification
        try {
            const subject = `${payloadData.childName} - ${payloadData.campaignCode}`;
            const htmlContent = `
                <h2>New Lead Received</h2>
                <p><strong>Child Name:</strong> ${payloadData.childName}</p>
                <p><strong>Age:</strong> ${payloadData.age}</p>
                <p><strong>Gender:</strong> ${payloadData.gender}</p>
                <p><strong>Campaign Code:</strong> ${payloadData.campaignCode}</p>
                <hr />
                <p><strong>Parent Name:</strong> ${payloadData.first_name || payloadData.firstName} ${payloadData.lastName}</p>
                <p><strong>Email:</strong> ${payloadData.email}</p>
                <p><strong>Phone:</strong> ${payloadData.phone}</p>
                <p><strong>Address:</strong> ${payloadData.city}, ${payloadData.zipCode}</p>
                <p><strong>Image:</strong> <a href="${payloadData.image_url}">View Image</a></p>
                <hr />
                <p><small>CRM Status: ${crmStatus}</small></p>
            `;

            const toAddress = process.env.SMTP_TO || process.env.LEAD_NOTIFICATION_EMAIL;

            if (!toAddress) {
                console.error("No email recipient (SMTP_TO or LEAD_NOTIFICATION_EMAIL) configured");
                // Don't throw, just log and continue so we don't break the client response
            } else {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"USA Kids" <notifications@usakids.com>',
                    to: toAddress,
                    subject: subject,
                    html: htmlContent,
                });
                console.log(`Email sent to ${toAddress}: ${subject}`);
            }
        } catch (emailError) {
            console.error("Failed to send email:", emailError);
            // Don't fail the request if email fails, just log it
        }

        return NextResponse.json({ success: true, message: "Lead sent to CRM", crmResponse });

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
