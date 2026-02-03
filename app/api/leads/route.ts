import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Map the incoming data to the CRM expected format
        const payload = {
            campaign: body.campaignCode || '',
            email: body.email || '',
            telephone: body.phone || '',
            address: `${body.city || ''}, ${body.zipCode || ''}`,
            firstname: body.childName || '', // Mapping Child Name to firstname
            lastname: body.lastName || '',
            image: body.image_url || '',
            analyticsid: body.firstName || '', // Mapping Parent First Name to analyticsid
            age: body.age ? String(body.age) : '',
            gender: body.gender || '',
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

        if (!response.ok) {
            const errorText = await response.text();
            console.error("CRM Webhook Error:", response.status, errorText);
            return NextResponse.json({ error: "Failed to send to CRM", details: errorText }, { status: response.status });
        }

        const responseData = await response.text(); // PHP might return text or JSON
        return NextResponse.json({ success: true, message: "Lead sent to CRM", crmResponse: responseData });

    } catch (error) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
