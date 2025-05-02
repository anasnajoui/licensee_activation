import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const whopApiKey = process.env.WHOP_API_KEY;

  if (!whopApiKey) {
    console.error('Whop API Key is not configured.');
    return NextResponse.json({ error: 'Server configuration error: Missing API Key.' }, { status: 500 });
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

    // Determine flow type
    const isClientActivation = formData.isClientActivation === true;
    console.log(`Processing request as: ${isClientActivation ? 'Client Activation' : 'New Licensee'}`);

    // Select Plan ID based on flow
    const planId = isClientActivation ? process.env.WHOP_PLAN_ID2 : process.env.WHOP_PLAN_ID;
    const planIdName = isClientActivation ? 'WHOP_PLAN_ID2' : 'WHOP_PLAN_ID';

    if (!planId) {
      console.error(`${planIdName} is not configured in environment variables.`);
      return NextResponse.json({ error: `Server configuration error: Missing ${planIdName}.` }, { status: 500 });
    }
    console.log(`Using Plan ID: ${planId} (from ${planIdName})`);

    // Basic validation (check base required fields for both flows)
    if (!formData.companyName || !formData.firstName || !formData.lastName || !formData.email || !formData.rawPhone) {
      console.log("Validation failed: Missing required base fields (using rawPhone for check).")
      return NextResponse.json({ error: 'Missing required form fields.' }, { status: 400 });
    }

    // Additional validation for client activation
    if (isClientActivation && !formData.licenseeId) {
        console.log("Validation failed: Missing licenseeId for client activation.")
        return NextResponse.json({ error: 'Missing Licensee ID for client activation.' }, { status: 400 });
    }

    // Prepare metadata conditionally
    const metadata: Record<string, any> = {
      companyName: formData.companyName,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: `+39${formData.rawPhone}`,
      companyWebsite: formData.companyWebsite || '',
      companyLogoUrl: formData.companyLogoUrl || '',
      form: isClientActivation ? "client activation" : "licensee start + setup fee", // Conditional form type
    };

    // Add licenseeId to metadata only if activating a client
    if (isClientActivation) {
        metadata.licenseeId = formData.licenseeId;
    }

    console.log("Prepared Metadata:", metadata);
    console.log("Calling Whop API with Plan ID:", planId);
    const whopApiUrl = 'https://api.whop.com/api/v2/checkout_sessions';

    const response = await fetch(whopApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': whopApiKey,
      },
      body: JSON.stringify({
        plan_id: planId, // Use the conditionally selected plan ID
        metadata: metadata, // Use the prepared metadata
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