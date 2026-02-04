import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

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

        let crmStatus = 'skipped';
        let crmResponse = 'Skipped CRM submission';

        // Only send to CRM if not explicitly skipped
        if (!body.skipCrm) {
            console.log("Sending payload to CRM:", payload);

            const response = await fetch('https://www.thestudiobookings.online/application/lead/service/importlead-api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            crmStatus = 'failed';

            if (!response.ok) {
                const errorText = await response.text();
                console.error("CRM Webhook Error:", response.status, errorText);
                crmResponse = `Error ${response.status}: ${errorText.substring(0, 200)}`;
            } else {
                const responseData = await response.text(); // PHP might return text or JSON
                crmStatus = 'success';
                crmResponse = responseData.substring(0, 200);
            }

            // Update Supabase if we have an ID (Only update CRM status if we actually tried)
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
        }

        // Send Email Notification
        try {
            // ... (Email logic) ...
            const subject = `${payloadData.childName} - ${payloadData.campaignCode}`;
            // ... (Email content) ...

            // ... (Send mail) ...
        } catch (emailError) {
            // ...
        }

        // 5. Send to Meta Conversion API (CAPI)
        try {
            const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1437635621416194';
            const apiToken = process.env.META_CONVERSION_API_TOKEN || 'EAAGGyZBLe88IBQu4JekaomCkrZBtuPzXjTNFof5TRq4NRTCmRftB4PToXUbZCneZA2J7F1cNOcnTJQchFjUeJkWQGXOzI5QiUyms1myIsYpG3KPAAiG9IUUO6NgNWaGUQ5h1HSZA0zPvNHNOKyFEIYzYcn9hrPR0QnsuWmrii9kXzZBxhlUEHWQKALsgJUmcZATDwZDZD';

            // Hash PII using SHA-256
            const sha256 = (str: string) => {
                return nodeCrypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
            };

            const eventTime = Math.floor(Date.now() / 1000);
            const userIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
            const userAgent = request.headers.get('user-agent') || '';

            const capiPayload = {
                data: [
                    {
                        event_name: 'Lead',
                        event_time: eventTime,
                        action_source: 'website',
                        event_id: payloadData.applicationId, // Deduplication Key
                        event_source_url: request.headers.get('referer') || 'https://kidsusa.org',
                        user_data: {
                            em: [sha256(payloadData.email)],
                            ph: [sha256(payloadData.phone.replace(/\D/g, ''))], // Simplify phone for better matching
                            client_ip_address: userIp,
                            client_user_agent: userAgent,
                            fn: [sha256(payloadData.childName)] // Optional: First Name
                        },
                        custom_data: {
                            currency: 'USD',
                            value: 0.0,
                            content_name: 'Application Form',
                            content_category: 'Modeling'
                        }
                    }
                ]
            };

            fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${apiToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(capiPayload)
            }).then(async (res) => {
                const txt = await res.text();
                console.log(`Meta CAPI Response: ${res.status}`, txt);
            }).catch(e => console.error("Meta CAPI Error:", e));

        } catch (capiError) {
            console.error("Meta CAPI Execution Error:", capiError);
        }

        return NextResponse.json({ success: true, message: "Lead sent to CRM", crmResponse });

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
