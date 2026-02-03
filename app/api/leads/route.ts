import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use Service Role to bypass RLS for updates
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

        return NextResponse.json({ success: true, message: "Lead sent to CRM", crmResponse });

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
