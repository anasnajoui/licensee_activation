import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const whopApiKey = process.env.WHOP_API_KEY;
  const whopPlanId = process.env.WHOP_PLAN_ID;

  if (!whopApiKey) {
    console.error('Whop API Key is not configured.');
    return NextResponse.json({ error: 'Server configuration error: Missing API Key.' }, { status: 500 });
  }
  if (!whopPlanId) {
    console.error('Whop Plan ID is not configured.');
    return NextResponse.json({ error: 'Server configuration error: Missing Plan ID.' }, { status: 500 });
  }

  try {
    console.log("--- NEW Checkout API Route Start ---"); // Added marker
    const rawBody = await request.text();
    console.log("Incoming raw request body:", rawBody);

    let formData;
    try {
        formData = JSON.parse(rawBody);
        console.log("Parsed form data:", formData);
    } catch (parseError) {
        console.error("JSON parsing error:", parseError);
        throw new Error('Invalid JSON format received from client.'); 
    }

    // Basic validation (check new fields)
    if (!formData.companyName || !formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      console.log("Validation failed: Missing required fields (firstName, lastName, email, phone).") // Updated log
      return NextResponse.json({ error: 'Missing required form fields.' }, { status: 400 });
    }

    console.log("Calling Whop API...");
    const whopApiUrl = 'https://api.whop.com/api/v2/checkout_sessions';

    const response = await fetch(whopApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': whopApiKey, 
      },
      body: JSON.stringify({
        plan_id: whopPlanId,
        metadata: {
          companyName: formData.companyName,
          // Send split names instead of fullName
          firstName: formData.firstName, 
          lastName: formData.lastName,   
          email: formData.email,
          phone: `+39${formData.phone}`, // Assume +39 prefix based on frontend format
          // Add the new optional fields
          companyWebsite: formData.companyWebsite || '', // Send empty string if not provided
          companyLogoUrl: formData.companyLogoUrl || '', // Send empty string if not provided
          // Add the new hardcoded field
          form: "licensee start + setup fee", 
        },
        // redirect_url: 'YOUR_SUCCESS_URL' 
      }),
    });
    
    console.log("Whop API response status:", response.status);

    if (!response.ok) {
        const whopErrorText = await response.text(); 
        console.error(`Whop API Error (${response.status}):`, whopErrorText);
        const errorMessage = whopErrorText || `Failed to create checkout session. Status: ${response.status}`;
        return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const responseData = await response.json();
    console.log("Whop API response data:", responseData);

    if (!responseData.purchase_url) {
        console.error('Whop API response missing purchase_url:', responseData);
        return NextResponse.json({ error: 'Failed to retrieve purchase URL from Whop.' }, { status: 500 });
    }

    console.log("Successfully created checkout session. Purchase URL:", responseData.purchase_url);
    console.log("--- NEW Checkout API Route End ---");
    return NextResponse.json({ purchase_url: responseData.purchase_url });

  } catch (error) {
    console.error('Error creating checkout session (outer catch):', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof Error) {
        errorMessage = error.message;
    } else {
        errorMessage = String(error);
    }
    console.log("--- NEW Checkout API Route Error End ---");
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 