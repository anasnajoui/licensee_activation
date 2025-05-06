import { NextRequest, NextResponse } from 'next/server';
// import { getLicenseeData, LicenseeDetails } from '../../../lib/googleSheets'; // Removed unused import
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

// Environment Variables
const WHOP_API_KEY = process.env.WHOP_API_KEY!;
const WHOP_PRODUCT_ID = process.env.WHOP_PRODUCT_ID!; // Add Product ID
const WHOP_PLAN_ID1 = process.env.WHOP_PLAN_ID1!; // Default plan (e.g., 1 account) - Still needed for NEW licenses
const WHOP_PLAN_ID2 = process.env.WHOP_PLAN_ID2!; // No longer needed for upgrades
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;

// Improved handling for GOOGLE_PRIVATE_KEY
const rawGooglePrivateKey = process.env.GOOGLE_PRIVATE_KEY;
if (!rawGooglePrivateKey) {
    console.error("FATAL ERROR: GOOGLE_PRIVATE_KEY environment variable is not set.");
    // In a real app, you might throw an error here or handle it appropriately
    // For now, we'll proceed, but Google API calls will fail.
}
const GOOGLE_PRIVATE_KEY = rawGooglePrivateKey ? rawGooglePrivateKey.replace(/\\n/g, '\n') : '';

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const LICENSE_PRICE_STR = process.env.LICENSE_PRICE; // Price per account license (e.g., "100.00")

// Constants
const REQUIRED_SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const SHEET_NAME = 'Licensee Info'; // Change if your sheet name is different

// --- Updated Column Mappings ---
const LICENSEE_ID_COLUMN = 'A';
const MEMBERSHIP_ID_COLUMN = 'B'; // Was G
const ACCOUNT_COUNT_COLUMN = 'C'; // Was H
const FULL_NAME_COLUMN = 'D'; // Was B (First Name)
// Columns E, F, G, H no longer referenced directly here based on new structure


// --- Helper Functions ---

async function getGoogleSheetData(licenseeId: string) {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY,
        },
        scopes: REQUIRED_SCOPES,
    });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        // Find the row corresponding to the licenseeId
        const idColumnValues = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: `${SHEET_NAME}!${LICENSEE_ID_COLUMN}:${LICENSEE_ID_COLUMN}`,
        });

        const ids = idColumnValues.data.values;
        if (!ids || ids.length === 0) {
            throw new Error('Sheet ID column is empty or not found.');
        }

        const rowIndex = ids.findIndex(row => row[0] === licenseeId) + 1; // 1-based index
        if (rowIndex === 0) {
            return null; // Licensee ID not found
        }

        // Fetch the required data from that row (Columns A to D)
        const range = `${SHEET_NAME}!${LICENSEE_ID_COLUMN}${rowIndex}:${FULL_NAME_COLUMN}${rowIndex}`;
        console.log(`[API getGoogleSheetData] Fetching range: ${range}`);

        const response = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range });

        if (!response.data.values || response.data.values.length === 0) {
            throw new Error('Row data not found for the given licensee ID.');
        }

        const rowData = response.data.values[0];

        // Extract data based on new column order
        // Column A: licenseeId (already known, index 0)
        const membershipId = rowData[1];    // Column B = index 1
        const accountCountStr = rowData[2]; // Column C = index 2
        const fullName = rowData[3];        // Column D = index 3
        const accountCount = parseInt(accountCountStr, 10);

        // Validate required data
        if (!membershipId || isNaN(accountCount) || !fullName) {
            console.warn(`[API getGoogleSheetData] Incomplete data fetched for licensee ${licenseeId} from row ${rowIndex}: membershipId=${membershipId}, accountCountStr=${accountCountStr}, fullName=${fullName}`);
             throw new Error('Incomplete data found in Google Sheet for the licensee. Check columns B, C, D.');
        }

        const result = { membershipId, accountCount, fullName };
        console.log(`[API getGoogleSheetData] Successfully fetched for ${licenseeId}:`, JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error("[API getGoogleSheetData] Google Sheets API Error:", error);
        if (error instanceof Error && error.message.includes('PERMISSION_DENIED')) {
             throw new Error('Permission denied accessing Google Sheet. Ensure the service account email has editor access to the sheet.');
        }
        // Keep specific error for incomplete data
        if (error instanceof Error && error.message.includes('Incomplete data')) {
            throw error;
        }
        throw new Error('Failed to retrieve data from Google Sheet.');
    }
}


async function getWhopMembershipDetails(membershipId: string) {
    const url = `https://api.whop.com/v2/memberships/${membershipId}`;
    try {
        console.log(`[API getWhopMembershipDetails] Fetching membership details for ID: ${membershipId} from URL: ${url}`);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Use API key directly (assuming it includes "Bearer ")
                'Authorization': WHOP_API_KEY, 
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Whop API Error (getMembershipDetails):', response.status, errorData);
            throw new Error(`Whop API Error: ${response.status} - ${errorData.error?.message || 'Failed to fetch membership details'}`);
        }
        const data = await response.json();
        
        // Log raw dates received from Whop
        console.log('[API getWhopMembershipDetails] Raw Whop API response:', JSON.stringify(data, null, 2));
        console.log('[API getWhopMembershipDetails] Raw renewal_period_end:', data.renewal_period_end);
        console.log('[API getWhopMembershipDetails] Raw renewal_period_start:', data.renewal_period_start);

        // Use the numeric timestamps directly from Whop (assuming they are in seconds)
        const renewalTimestamp = typeof data.renewal_period_end === 'number' ? data.renewal_period_end : null;
        const startTimestamp = typeof data.renewal_period_start === 'number' ? data.renewal_period_start : null;

        console.log('[API getWhopMembershipDetails] Using renewalTimestamp:', renewalTimestamp);
        console.log('[API getWhopMembershipDetails] Using startTimestamp:', startTimestamp);

        if (!renewalTimestamp || !startTimestamp) {
             throw new Error('Missing or invalid numeric renewal period start or end date in Whop membership data.');
        }
        const result = { renewalTimestamp, startTimestamp };
        console.log(`[API getWhopMembershipDetails] Successfully parsed details for ${membershipId}:`, JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error("[API getWhopMembershipDetails] Error fetching or parsing Whop membership details:", error);
        throw new Error('Could not connect to Whop API or parse membership details.');
    }
}

// --- Updated createWhopPromoCode --- 
interface PromoCodeOptions {
    planId: string;
    promoType: 'flat_amount' | 'percentage';
    value: number; // Either the flat amount (EUR) or the percentage value
}

async function createWhopPromoCode({ planId, promoType, value }: PromoCodeOptions) {
    const url = 'https://api.whop.com/v2/promo_codes';
    const codePrefix = promoType === 'percentage' ? 'UPGPERC-' : 'UPGRADE-';
    const promoCode = `${codePrefix}${uuidv4().substring(0, 8).toUpperCase()}`;

    let amountOffValue: number;

    if (promoType === 'flat_amount') {
        // Value is flat amount in EUR, round to 2 decimal places
        amountOffValue = Math.max(0, parseFloat(value.toFixed(2)));
        if (amountOffValue === 0) {
            console.log("[API createWhopPromoCode] Flat amount discount is zero. No promo code will be created.");
            return null;
        }
        console.log(`[API createWhopPromoCode] Creating flat amount promo code: ${amountOffValue} EUR for planId: ${planId}`);
    } else { // percentage
        // Value is percentage, ensure it's reasonable (e.g., 0-100)
        amountOffValue = Math.max(0, Math.min(100, parseFloat(value.toFixed(2)))); 
        if (amountOffValue === 0) {
            console.log("[API createWhopPromoCode] Percentage discount is zero. No promo code will be created.");
            return null;
        }
         console.log(`[API createWhopPromoCode] Creating percentage promo code: ${amountOffValue}% for planId: ${planId}`);
    }

    // Request body structure based on Whop Docs
    const body = {
        code: promoCode,
        promo_type: promoType, // 'flat_amount' or 'percentage'
        amount_off: amountOffValue, // The calculated flat amount OR percentage
        base_currency: 'eur', // Required even for percentage? Assuming yes.
        plan_ids: [planId],
        stock: 1,
        duration: 'once', // Apply only to the first payment
        metadata: { 
            usage: 'Single-use upgrade discount',
            type: promoType,
            value: amountOffValue
        }
    };

    console.log('[API createWhopPromoCode] Sending body to Whop:', JSON.stringify(body, null, 2));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': WHOP_API_KEY, // Use API key directly (assuming it includes "Bearer ")
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Whop API Error (createPromoCode):', response.status, errorData);
            const specificError = errorData.error?.message || (errorData.errors ? JSON.stringify(errorData.errors) : 'Failed to create promo code');
            throw new Error(`Whop API Error: ${response.status} - ${specificError}`);
        }
        const data = await response.json();
        console.log("[API createWhopPromoCode] Promo code created successfully:", JSON.stringify(data, null, 2));
        return data.code; // Return the generated promo code string
    } catch (error) {
        console.error("[API createWhopPromoCode] Error creating Whop promo code:", error);
         throw new Error('Could not connect to Whop API to create promo code.');
    }
}

// Updated function to accept optional trial days
async function createWhopCheckoutSession(planId: string, metadata: Record<string, any>, trialDays?: number) {
    const url = 'https://api.whop.com/v2/checkout_sessions';
    const body: Record<string, any> = {
        plan_id: planId,
        metadata: metadata,
        success_url: process.env.NEXT_PUBLIC_SUCCESS_URL || 'http://localhost:3000/success', 
        cancel_url: process.env.NEXT_PUBLIC_CANCEL_URL || 'http://localhost:3000/', 
    };

    // Add trial_period_days if provided and valid
    if (trialDays && trialDays > 0) {
        body.trial_period_days = Math.round(trialDays); // Ensure it's an integer
        console.log(`[API createWhopCheckoutSession] Adding trial period: ${body.trial_period_days} days to plan ${planId}`);
    } else {
        console.log(`[API createWhopCheckoutSession] No trial period requested for plan ${planId}.`);
    }

    console.log(`[API createWhopCheckoutSession] Requesting checkout session for planId: ${planId}. Body:`, JSON.stringify(body, null, 2));

    try {
        const response = await fetch(url, {
      method: 'POST',
      headers: {
                 'Authorization': WHOP_API_KEY, // Use API key directly (assuming it includes "Bearer ")
                 'Accept': 'application/json',
        'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

    if (!response.ok) {
            const errorData = await response.json();
            console.error('Whop API Error (createCheckoutSession):', response.status, errorData);
            const errorMessage = errorData.error?.message || 'Failed to create checkout session';
            throw new Error(`Whop API Error: ${response.status} - ${errorMessage}`);
        }
        const data = await response.json();
        console.log("[API createWhopCheckoutSession] Checkout session created successfully. Response:", JSON.stringify(data, null, 2));
        console.log("[API createWhopCheckoutSession] Purchase URL:", data.purchase_url);
        return data.purchase_url;
    } catch (error) {
        console.error("[API createWhopCheckoutSession] Error creating Whop checkout session:", error);
        throw new Error('Could not connect to Whop API to create checkout session.');
    }
}

// --- NEW: Helper Function to Terminate Membership ---
async function terminateWhopMembership(membershipId: string): Promise<{ success: boolean; error?: string }> {
    const url = `https://api.whop.com/v2/memberships/${membershipId}/terminate`;
    console.log(`[API terminateWhopMembership] Attempting to terminate membership ID: ${membershipId} via URL: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': WHOP_API_KEY, // Use API key directly (assuming it includes "Bearer ")
                'Accept': 'application/json',
            },
            // No body required for this endpoint according to docs
        });

        if (!response.ok) {
            let errorData;
            let errorBodyText = await response.text(); // Get text for logging non-JSON or for message checks
            try {
                errorData = JSON.parse(errorBodyText); // Try to parse as JSON
            } catch (e) {
                errorData = { error: { message: `Termination failed with status ${response.status}. Response not JSON: ${errorBodyText}` } };
            }
            
            const errorMessage = errorData?.error?.message || `Failed to terminate membership (Status: ${response.status})`;
            const whopErrorCode = errorData?.error?.code; // Whop might have specific error codes

            console.warn(`[API terminateWhopMembership] Whop API Error. Status: ${response.status}, Body: ${errorBodyText}, Parsed Message: ${errorMessage}, Whop Code: ${whopErrorCode}`);

            // Check for conditions indicating membership is already terminated or non-existent
            // Common indicators:
            // 1. Status 404 (Not Found)
            // 2. Status 422 (Unprocessable Entity) if it means "already terminated" or similar state
            // 3. Specific error messages (case-insensitive check)
            const alreadyTerminatedMessages = [
                "membership has already been terminated",
                "membership already canceled",
                "membership not found",
                "membership is not active",
                "cannot terminate a canceled subscription",
                "cannot be terminated as it is already cancelled"
            ];

            const isAlreadyTerminated = 
                response.status === 404 || 
                response.status === 422 || // Depending on Whop's API for this state
                alreadyTerminatedMessages.some(msg => errorMessage.toLowerCase().includes(msg.toLowerCase()));

            if (isAlreadyTerminated) {
                console.log(`[API terminateWhopMembership] Membership ${membershipId} is already terminated or not found. Considering this a success for the upgrade flow.`);
                return { success: true }; // Treat as success
            }
            
            // For other errors, return failure
            return { success: false, error: `Whop API Error: ${response.status} - ${errorMessage}` }; 
        }
        
        // Successful termination by API (2xx response)
        let responseBodyText = await response.text();
        console.log(`[API terminateWhopMembership] Successfully terminated membership: ${membershipId}, Status: ${response.status}, Response Body: ${responseBodyText}`);
        return { success: true };

    } catch (error) {
        console.error("[API terminateWhopMembership] Network or other error during Whop membership termination:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during termination request.';
        return { success: false, error: `Could not connect to Whop API to terminate membership: ${errorMessage}` };
    }
}

// --- NEW: Helper Function to Create a Plan ---
interface CreatePlanOptions {
    productId: string;
    renewalPrice: number;
    initialPrice: number;
    trialDays: number;
    planName: string; // e.g., "Upgrade for Licensee XYZ - 3 Accounts"
    metadata?: Record<string, any>;
}

async function createWhopPlan({
    productId,
    renewalPrice,
    initialPrice,
    trialDays,
    planName,
    metadata = {}
}: CreatePlanOptions): Promise<{ success: boolean; planId?: string; error?: string }> {
    const url = 'https://api.whop.com/v2/plans';
    console.log(`[API createWhopPlan] Attempting to create plan. Name: ${planName}, Product ID: ${productId}`);

    const body: Record<string, any> = {
        product_id: productId,
        plan_type: 'renewal',
        billing_period: 30, // Hardcoded 30-day cycle
        base_currency: 'eur',
        renewal_price: parseFloat(renewalPrice.toFixed(2)), // Ensure 2 decimals
        initial_price: parseFloat(initialPrice.toFixed(2)), // Ensure 2 decimals
        trial_period_days: Math.max(0, Math.round(trialDays)), // Ensure non-negative integer
        internal_notes: planName, // Use generated name for internal notes
        payment_link_description: planName, // Use generated name for customer display? Or something more generic?
        visibility: 'hidden', // Or 'quick_link'? Hidden seems safer for dynamic plans.
        unlimited_stock: true, // Assume unlimited stock for these dynamic plans
        metadata: metadata, // Attach provided metadata to the plan
        // Add other necessary defaults?
        accepted_payment_methods: ['stripe'], // Assuming stripe
    };

    console.log("[API createWhopPlan] Sending body to Whop:", JSON.stringify(body, null, 2));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': WHOP_API_KEY, // Use API key directly
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const responseData = await response.json(); // Try to parse JSON regardless of status

        if (!response.ok) {
            console.error('Whop API Error (createPlan):', response.status, responseData);
            const errorMessage = responseData.error?.message || (responseData.errors ? JSON.stringify(responseData.errors) : 'Failed to create plan');
            return { success: false, error: `Whop API Error: ${response.status} - ${errorMessage}` };
        }

        const newPlanId = responseData.id;
        if (!newPlanId) {
             console.error('Whop API Error (createPlan): Plan ID missing in successful response', responseData);
             return { success: false, error: 'Plan created successfully but ID was not returned.' };
        }

        console.log(`[API createWhopPlan] Successfully created plan. ID: ${newPlanId}, Name: ${planName}. Full response:`, JSON.stringify(responseData, null, 2));
        return { success: true, planId: newPlanId };

  } catch (error) {
        console.error("[API createWhopPlan] Error creating Whop plan:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during plan creation request.';
        return { success: false, error: `Could not connect to Whop API to create plan: ${errorMessage}` };
    }
}

// --- Main Handler ---

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const step = searchParams.get('step');
    const requestTimestamp = new Date().toISOString();
    console.log(`\n--- [API /api/checkout] Received POST request at ${requestTimestamp}. Step: ${step || 'default (createCheckout)'} ---`);


    try {
        const formData = await req.formData();
        const licenseeId = formData.get('licenseeId') as string; // Always present now
        const emailFromForm = formData.get('email') as string | null; // Renamed to avoid conflict
        const isUpgrade = formData.get('upgradeFlowActive') === 'true';

        // Log all incoming formData for debugging
        const formDataEntries: Record<string, any> = {};
        for (const [key, value] of formData.entries()) {
            formDataEntries[key] = value;
        }
        console.log('[API /api/checkout] Incoming FormData:', JSON.stringify(formDataEntries, null, 2));


        if (!LICENSE_PRICE_STR || isNaN(parseFloat(LICENSE_PRICE_STR))) {
           throw new Error('LICENSE_PRICE environment variable is missing or not a valid number.');
        }
        const LICENSE_PRICE = parseFloat(LICENSE_PRICE_STR);

        // --- STEP 1: Get Info for Upgrade ---
        if (step === 'getInfo' && isUpgrade) {
            if (!licenseeId) {
                console.error('[API /api/checkout][getInfo] Error: Licensee ID is required.');
                return NextResponse.json({ error: 'Licensee ID is required for upgrade info step.' }, { status: 400 });
    }

             console.log(`[API /api/checkout][getInfo] Started for licenseeId: ${licenseeId}`);

            // 1. Fetch data from Google Sheet (using updated logic)
            console.log(`[API /api/checkout][getInfo] Fetching Google Sheet data for licenseeId: ${licenseeId}`);
            const sheetData = await getGoogleSheetData(licenseeId);
            if (!sheetData) {
                console.warn(`[API /api/checkout][getInfo] Licensee ID ${licenseeId} not found in registry.`);
                return NextResponse.json({ error: 'Licensee ID not found in registry.' }, { status: 404 });
            }
            console.log(`[API /api/checkout][getInfo] Google Sheet data for ${licenseeId}:`, JSON.stringify(sheetData, null, 2));
            // Use fullName from sheetData
            const { membershipId, accountCount, fullName } = sheetData;

            // 2. Fetch Whop Membership Details
            console.log(`[API /api/checkout][getInfo] Fetching Whop membership details for membershipId: ${membershipId}`);
            const { renewalTimestamp, startTimestamp } = await getWhopMembershipDetails(membershipId);
            console.log(`[API /api/checkout][getInfo] Whop membership details for ${membershipId}: renewalTimestamp=${renewalTimestamp}, startTimestamp=${startTimestamp}`);

            // 3. Calculate Proration & Prices for Dynamic Plan (Day-Based)
            const now = Math.floor(Date.now() / 1000);
            let remainingDays = 0;
            // Check if currently within an active, unexpired subscription period
            if (renewalTimestamp && startTimestamp && renewalTimestamp > now && startTimestamp < now) {
                const remainingSeconds = renewalTimestamp - now;
                if (remainingSeconds > 0) {
                    remainingDays = Math.ceil(remainingSeconds / (60 * 60 * 24));
                }
            } // If not in an active cycle, or cycle ended, remainingDays remains 0.

            let proratedInitialChargePreVat = 0;
            const newTotalAccountCount = accountCount + 1;
            // Calculate the full renewal price for the new total number of accounts
            const newRenewalPricePreVat = newTotalAccountCount * LICENSE_PRICE;

            if (remainingDays > 0) {
                // Assume LICENSE_PRICE is the charge for a standard 30-day period for one license.
                const dailyLicensePrice = LICENSE_PRICE / 30;
                proratedInitialChargePreVat = dailyLicensePrice * remainingDays;

                console.log(`[API /api/checkout][getInfo] -- Proration Calculation (Day-Based) --`);
                console.log(`  Licensee ID: ${licenseeId}, Membership ID: ${membershipId}`);
                console.log(`  Current Account Count (Old Plan): ${accountCount}, New Total Account Count (New Plan): ${newTotalAccountCount}`);
                console.log(`  Current Time (Unix): ${now} (${new Date(now * 1000).toISOString()})`);
                if(renewalTimestamp) console.log(`  Old Plan Renewal Timestamp (Unix): ${renewalTimestamp} (${new Date(renewalTimestamp * 1000).toISOString()})`);
                if(startTimestamp) console.log(`  Old Plan Start Timestamp (Unix): ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`);
                console.log(`  Calculated Remaining Days (Ceiled): ${remainingDays}`);
                console.log(`  LICENSE_PRICE (assumed for 30 days): ${LICENSE_PRICE.toFixed(2)} EUR`);
                console.log(`  Calculated Daily License Price: ${dailyLicensePrice.toFixed(4)} EUR`);
                console.log(`  Prorated Initial Charge for 1 new license (Pre-VAT): ${proratedInitialChargePreVat.toFixed(2)} EUR (Daily Price * Remaining Days)`);
                console.log(`  New Renewal Price for ${newTotalAccountCount} accounts (New Plan, Pre-VAT): ${newRenewalPricePreVat.toFixed(2)} EUR`);
                console.log(`  Trial Days for New Plan (matches remainingDays): ${remainingDays}`);
                console.log(`------------------------------------------------`);
            } else {
                // No proration if remainingDays is 0 (e.g., subscription expired, or outside active period)
                // proratedInitialChargePreVat remains 0.
                // remainingDays is 0, so new plan trial will be 0 days.
                console.log(`[API /api/checkout][getInfo] No proration applied: 'remainingDays' is ${remainingDays}.`);
                console.log(`  This occurs if the old subscription has expired or is outside its active period.`);
                console.log(`  Prorated Initial Charge for new license (Pre-VAT) set to 0.00 EUR.`);
                console.log(`  New Renewal Price for ${newTotalAccountCount} accounts (New Plan, Pre-VAT): ${newRenewalPricePreVat.toFixed(2)} EUR`);
                console.log(`  Trial Days for New Plan will be 0.`);
                console.log(`------------------------------------------------`);
            }

            // 4. Target Plan ID is dynamically created later, no fixed ID needed here

            // 5. NO Promo Code Generation needed
            console.log("[API /api/checkout][getInfo] Skipping promo code generation (using dynamic plan method).");

            // Format next renewal date (use renewalTimestamp for accuracy)
             const nextRenewalDate = new Date(renewalTimestamp * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
             console.log(`[API /api/checkout][getInfo] Formatted nextRenewalDate (from old plan): ${nextRenewalDate}`);

             // --- Get user details from the incoming form data to echo back --- 
             const emailClient = formData.get('email') as string; // Renamed to avoid conflict with outer scope 'email'
             const companyName = formData.get('companyName') as string;
             const firstName = formData.get('firstName') as string;
             const lastName = formData.get('lastName') as string;
             const rawPhone = formData.get('rawPhone') as string;
             const companyWebsite = formData.get('companyWebsite') as string;
             const companyLogoUrl = formData.get('companyLogoUrl') as string;

             // 6. Return Data to Frontend (Updated Payload)
             const responsePayload = {
                 success: true,
                 licenseeId: licenseeId,
                 membershipId: membershipId,
                 accountCount: accountCount, // Old account count
                 // targetPrice: LICENSE_PRICE, // Rename/remove? Base price is implied
                 // netChargeToday: targetChargeTodayPreVat, // Rename to initialCharge?
                 proratedInitialChargePreVat: proratedInitialChargePreVat, // Initial fee for new plan
                 newRenewalPricePreVat: newRenewalPricePreVat, // Renewal price for new plan
                 // promoCode: promoCode, // Removed
                 remainingDays: remainingDays, // For trial period
                 // newPlanId: targetPlanId, // Removed - Will be created later
                 renewalTimestamp: renewalTimestamp, // Keep old renewal timestamp for reference/metadata
                  nextCycleInfo: nextRenewalDate, // Formatted old renewal date
                  fullName: fullName, // From Google Sheet
                  // Echoed form data:
                  email: emailClient,
                  companyName: companyName,
                  firstName: firstName,
                  lastName: lastName,
                  rawPhone: rawPhone,
                  companyWebsite: companyWebsite,
                  companyLogoUrl: companyLogoUrl
              };

            // Log the exact payload being sent back
            console.log("[API /api/checkout][getInfo] Returning response payload:", JSON.stringify(responsePayload, null, 2));

            return NextResponse.json(responsePayload);

        }
        // --- NEW STEP: Terminate Membership --- 
        else if (step === 'terminateMembership' && isUpgrade) {
            console.log(`[API /api/checkout][terminateMembership] Started. isUpgrade=${isUpgrade}`);
            const membershipIdToTerminate = formData.get('membershipId') as string | null;
            console.log(`[API /api/checkout][terminateMembership] Membership ID to terminate: ${membershipIdToTerminate}`);

            if (!membershipIdToTerminate) {
                 console.error('[API /api/checkout][terminateMembership] Error: Membership ID is required.');
                 return NextResponse.json({ error: 'Membership ID is required for termination step.' }, { status: 400 });
            }

            console.log(`[API /api/checkout][terminateMembership] Calling terminateWhopMembership for ${membershipIdToTerminate}`);
            const terminationResult = await terminateWhopMembership(membershipIdToTerminate);
            console.log(`[API /api/checkout][terminateMembership] Termination result for ${membershipIdToTerminate}:`, JSON.stringify(terminationResult, null, 2));

            if (!terminationResult.success) {
                console.error(`[API /api/checkout][terminateMembership] Failed to terminate membership ${membershipIdToTerminate}. Error: ${terminationResult.error}`);
                 return NextResponse.json({ error: terminationResult.error || 'Failed to terminate membership.' }, { status: 500 });
            }

            const successResponse = { success: true, message: 'Membership terminated successfully.' };
            console.log(`[API /api/checkout][terminateMembership] Successfully terminated ${membershipIdToTerminate}. Returning:`, JSON.stringify(successResponse, null, 2));
            return NextResponse.json(successResponse);

        }
        // --- STEP createPlanAndCheckout (Upgrade Flow - New Step) ---
        else if (step === 'createPlanAndCheckout' && isUpgrade) {
            console.log(`[API /api/checkout][createPlanAndCheckout] Started for UPGRADE flow. Licensee ID: ${licenseeId}`);
            
            // Extract all necessary data from formData
            const oldMembershipId = formData.get('oldMembershipId') as string;
            const oldRenewalTimestampStr = formData.get('oldRenewalTimestamp') as string;
            const accountCountStr = formData.get('accountCount') as string; // This is the OLD account count
            const remainingDaysStr = formData.get('remainingDays') as string;
            const proratedInitialChargePreVatStr = formData.get('proratedInitialChargePreVat') as string;
            const newRenewalPricePreVatStr = formData.get('newRenewalPricePreVat') as string;
            
            // User details for metadata (already extracted basically, but good to log them together for this step)
            const clientEmail = formData.get('email') as string;
            const clientCompanyName = formData.get('companyName') as string;
            const clientFirstName = formData.get('firstName') as string;
            const clientLastName = formData.get('lastName') as string;
            const clientRawPhone = formData.get('rawPhone') as string;
            const clientCompanyWebsite = formData.get('companyWebsite') as string;
            const clientCompanyLogoUrl = formData.get('companyLogoUrl') as string;

            console.log(`[API /api/checkout][createPlanAndCheckout] Received Data:
                Licensee ID: ${licenseeId}
                Old Membership ID: ${oldMembershipId}
                Old Renewal Timestamp: ${oldRenewalTimestampStr}
                Old Account Count: ${accountCountStr}
                Remaining Days for Trial: ${remainingDaysStr}
                Prorated Initial Charge (Pre-VAT): ${proratedInitialChargePreVatStr}
                New Renewal Price (Pre-VAT): ${newRenewalPricePreVatStr}
                Client Email: ${clientEmail}
                Client Company: ${clientCompanyName}
            `);

            // Validate required fields
            if (!licenseeId || !oldMembershipId || !oldRenewalTimestampStr || !accountCountStr || !remainingDaysStr || !proratedInitialChargePreVatStr || !newRenewalPricePreVatStr ) {
                console.error('[API /api/checkout][createPlanAndCheckout] Missing required fields for creating plan and checkout.');
                return NextResponse.json({ error: 'Missing required fields for creating plan and checkout.' }, { status: 400 });
            }

            const oldAccountCount = parseInt(accountCountStr, 10);
            const remainingDaysForTrial = parseInt(remainingDaysStr, 10);
            const initialCharge = parseFloat(proratedInitialChargePreVatStr);
            const renewalCharge = parseFloat(newRenewalPricePreVatStr);
            const oldRenewalTimestamp = parseInt(oldRenewalTimestampStr, 10);
            const newTotalAccountCount = oldAccountCount + 1;

            // 1. Create Whop Plan
            const planName = `Upgrade Plan - ${newTotalAccountCount} Accounts - ${licenseeId} - ${new Date().toISOString().split('T')[0]}`;
            const planMetadata = {
                licensee_id: licenseeId,
                flow_type: 'upgrade_dynamic_plan_creation',
                original_licensee_id: licenseeId, // Explicitly adding for clarity on plan if needed
                created_for_upgrade: "true",
                old_membership_id: oldMembershipId,
            };
            console.log(`[API /api/checkout][createPlanAndCheckout] Creating Whop Plan with name: "${planName}"`);
            const planResult = await createWhopPlan({
                productId: WHOP_PRODUCT_ID,
                renewalPrice: renewalCharge,
                initialPrice: initialCharge,
                trialDays: remainingDaysForTrial,
                planName: planName,
                metadata: planMetadata
            });

            if (!planResult.success || !planResult.planId) {
                console.error(`[API /api/checkout][createPlanAndCheckout] Failed to create Whop Plan. Error: ${planResult.error}`);
                return NextResponse.json({ error: planResult.error || 'Failed to create new Whop plan.' }, { status: 500 });
            }
            const newPlanId = planResult.planId;
            console.log(`[API /api/checkout][createPlanAndCheckout] Successfully created new Whop Plan ID: ${newPlanId}`);

            // 2. Prepare Checkout Session Metadata
            const checkoutMetadata: Record<string, any> = {
                licensee_id: licenseeId,
                flow_type: 'upgrade_checkout_after_termination_and_plan_creation',
                old_terminated_membership_id: oldMembershipId,
                old_renewal_timestamp: oldRenewalTimestamp,
                new_plan_id_created: newPlanId,
                // Client details echoed from form for record-keeping on checkout
                email: clientEmail ?? 'N/A',
                companyName: clientCompanyName ?? 'N/A',
                firstName: clientFirstName ?? 'N/A',
                lastName: clientLastName ?? 'N/A',
                phone: clientRawPhone ?? 'N/A',
                website: clientCompanyWebsite ?? 'N/A',
                logoUrl: clientCompanyLogoUrl ?? 'N/A',
            };
            console.log('[API /api/checkout][createPlanAndCheckout] Prepared metadata for checkout session:', JSON.stringify(checkoutMetadata, null, 2));
            
            // 3. Create Whop Checkout Session
            // For dynamically created plans with initial_price and trial_period_days,
            // we do not pass trialDays again to createWhopCheckoutSession.
            // The trial is part of the plan itself.
            console.log(`[API /api/checkout][createPlanAndCheckout] Creating Whop Checkout Session for new Plan ID: ${newPlanId}`);
            const purchaseUrl = await createWhopCheckoutSession(newPlanId, checkoutMetadata /*, undefined trialDays is part of plan */);

            if (!purchaseUrl) {
                console.error(`[API /api/checkout][createPlanAndCheckout] Failed to create checkout session URL for new Plan ID: ${newPlanId}`);
                return NextResponse.json({ error: 'Failed to create checkout session URL.' }, { status: 500 });
            }
            
            const successResponseData = { success: true, purchase_url: purchaseUrl };
            console.log('[API /api/checkout][createPlanAndCheckout] Successfully created checkout session. Returning purchase URL:', JSON.stringify(successResponseData, null, 2));
            return NextResponse.json(successResponseData);
        }
        // --- STEP 3 (or Default for NEW): Create Checkout Session ---
        // This 'createCheckout' or default step is now PRIMARILY FOR NEW LICENSEES
        // The UPGRADE flow has its own 'createPlanAndCheckout' step above.
        // The old logic for `isUpgrade` in this block might be redundant or needs adjustment
        // if it was intended for a different type of upgrade not covered by dynamic plan creation.
        // For now, assuming WHOP_PLAN_ID2 is NOT for dynamic upgrades.
        else if (step === 'createCheckout' || !step) { 
            console.log(`[API /api/checkout][createCheckout - Default/New Licensee] Started. isUpgrade=${isUpgrade}, licenseeId=${licenseeId}`);

            // If isUpgrade is true here, it implies an upgrade flow that *doesn't* use the dynamic plan creation.
            // This might be an older/alternative upgrade path using a pre-existing WHOP_PLAN_ID2.
            // Given the new 'createPlanAndCheckout' step, this path for upgrades should be clarified or deprecated.
            // For now, the logic remains, but with a warning.
            if (isUpgrade) {
                console.warn(`[API /api/checkout][createCheckout - Default/New Licensee] CAUTION: 'isUpgrade' is true in the default checkout block. This flow might be deprecated by the 'createPlanAndCheckout' step. Using WHOP_PLAN_ID2: ${WHOP_PLAN_ID2}`);
            }

            const planIdToUse = isUpgrade ? WHOP_PLAN_ID2 : WHOP_PLAN_ID1; 
            console.log(`[API /api/checkout][createCheckout - Default/New Licensee] Using Plan ID: ${planIdToUse}`);


            // Initialize metadata with common fields
            const metadata: Record<string, any> = {
                licensee_id: licenseeId, // Will be empty string if new licensee hasn't entered one (which is fine for new)
                flow_type: isUpgrade ? 'upgrade_static_plan' : 'new_license', // Clarified flow_type
            };

            // If it's an upgrade (static plan type)
            if (isUpgrade) {
                 const providedMembershipId = formData.get('membershipId') as string | null; // This would be old membership
                 const providedRenewalTimestampStr = formData.get('renewalTimestamp') as string | null;
                 
                 if (!providedMembershipId || !providedRenewalTimestampStr) {
                     console.error('[API /api/checkout][createCheckout - Default/New Licensee] Error: Membership ID and Old Renewal Timestamp are required for static plan upgrade.');
                     return NextResponse.json({ error: 'Membership ID and Old Renewal Timestamp are required for upgrade checkout creation.' }, { status: 400 });
                 }

                 metadata.old_terminated_membership_id = providedMembershipId; // Assuming termination happened BEFORE this step
                 metadata.old_renewal_timestamp = parseInt(providedRenewalTimestampStr, 10); 
                 
                 console.log(`[API /api/checkout][createCheckout - Default/New Licensee] Static Upgrade checkout requested. Old Mem ID: ${providedMembershipId}, Old Renewal: ${providedRenewalTimestampStr}`);
            } else {
                 console.log(`[API /api/checkout][createCheckout - Default/New Licensee] New license checkout requested. licenseeId=${licenseeId || '(New)'}, email=${emailFromForm}`);
            }

             // Now, add the user/company details (applies to both new and this static upgrade)
             metadata.email = formData.get('email') as string ?? 'N/A'; // emailFromForm could be used here too
             metadata.companyName = formData.get('companyName') as string ?? 'N/A';
             metadata.firstName = formData.get('firstName') as string ?? 'N/A';
             metadata.lastName = formData.get('lastName') as string ?? 'N/A';
             metadata.phone = formData.get('rawPhone') as string ?? 'N/A';
             metadata.website = formData.get('companyWebsite') as string ?? 'N/A';
             metadata.logoUrl = formData.get('companyLogoUrl') as string ?? 'N/A';

            // Log the final metadata being sent
            console.log('[API /api/checkout][createCheckout - Default/New Licensee] Sending metadata:', JSON.stringify(metadata, null, 2));

            // For new licensees (WHOP_PLAN_ID1) or static upgrades (WHOP_PLAN_ID2), trialDays are usually not set here unless the plan itself has a trial.
            // If WHOP_PLAN_ID2 was supposed to have a dynamic trial, that logic is missing.
            // Assuming no trial days passed directly to checkout session for these static plans.
            const purchaseUrl = await createWhopCheckoutSession(planIdToUse, metadata, undefined); 

            if (!purchaseUrl) {
                console.error(`[API /api/checkout][createCheckout - Default/New Licensee] Failed to create checkout session URL for plan ${planIdToUse}.`);
                return NextResponse.json({ error: 'Failed to create checkout session URL.' }, { status: 500 });
            }
            
            const responseData = { success: true, purchase_url: purchaseUrl };
            console.log('[API /api/checkout][createCheckout - Default/New Licensee] Successfully created checkout. Returning:', JSON.stringify(responseData, null, 2));
            return NextResponse.json(responseData);

        }
        // --- Invalid Step ---
        else {
            console.warn(`[API /api/checkout] Invalid step parameter specified: ${step}. isUpgrade=${isUpgrade}`);
            return NextResponse.json({ error: 'Invalid step parameter specified.' }, { status: 400 });
        }

    } catch (error: unknown) {
        let message = 'An unexpected error occurred.';
        let statusCode = 500;

    if (error instanceof Error) {
            message = error.message;
        }
        console.error(`[API /api/checkout] --- ERROR HANDLER --- Step: ${step}, Request Time: ${requestTimestamp}`, error); // Log the actual error object
        // Check if the error is from a specific known source (like Whop API, Sheets API) if needed for better client messages
        if (message.startsWith('Whop API Error:')) {
             // Extract status from Whop error if possible, e.g. "Whop API Error: 400 - Details"
            const match = message.match(/Whop API Error: (\d{3})/);
            if (match) statusCode = parseInt(match[1], 10);
        } else if (message.startsWith('Permission denied') || message.includes('Incomplete data') || message.includes('not found in registry')) {
             // Keep specific error messages from known sources
             if (message.includes('not found in registry')) statusCode = 404;
             else statusCode = 400; // Or 403 for permission denied
        } else if (message.includes('LICENSE_PRICE')) {
             message = 'Configuration error: License price not set correctly.'; // More generic for client
             statusCode = 500; // Internal config error
        } else if (message.includes('Missing required fields')) {
            statusCode = 400; // Bad request due to missing fields
        }
        // For other errors, keep the generic message and 500 status
        
        // Only send detailed messages for specific errors, otherwise generic for client
        const clientErrorMessage = (statusCode >= 500 && !message.startsWith('Whop API Error:')) // Only show generic for 5xx unless it's a Whop one
            ? 'An internal server error occurred. Please try again later.'
            : message;

        console.log(`[API /api/checkout] Returning error response. Status: ${statusCode}, Message for client: "${clientErrorMessage}"`);
        return NextResponse.json({ error: clientErrorMessage }, { status: statusCode });
  }
} 