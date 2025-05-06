import { google } from 'googleapis';

// Define the structure of the data we expect to return
export interface LicenseeDetails {
  membershipId: string;
  accountCount: number;
}

// Create JWT auth client
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\n/g, '\n'), // Ensure newlines are handled correctly
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '15GuBtzdqtgkXdPrnEUFnaRPwKGA51tog2iNA9QPwlyc';
const SHEET_NAME = 'Licensee Info'; // Make sure this matches your sheet tab name exactly

/**
 * Fetches licensee data from Google Sheets based on licenseeId.
 * @param licenseeId The ID to search for in Column A.
 * @returns An object containing membershipId (Column B) and accountCount (Column C).
 * @throws Error if licenseeId is not found or data is invalid.
 */
export async function getLicenseeData(licenseeId: string): Promise<LicenseeDetails> {
  console.log(`[GoogleSheets] Attempting to fetch data for licenseeId: ${licenseeId}`);

  if (!licenseeId) {
    throw new Error('[GoogleSheets] Licensee ID cannot be empty.');
  }
  
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
      console.error('[GoogleSheets] Missing Google Sheets API credentials in environment variables.');
      throw new Error('Server configuration error: Missing Google Sheets credentials.');
  }

  try {
    // Fetch columns A, B, and C
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:C`, // Read columns A through C
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log('[GoogleSheets] No data found in the sheet.');
      throw new Error('Could not read data from Google Sheet.');
    }

    // Find the row matching the licenseeId (case-insensitive comparison might be safer)
    // Skip header row if present (assuming row 0 is header)
    const headerRow = rows[0]; // Optional: Log header if needed
    console.log('[GoogleSheets] Sheet Headers:', headerRow); 
    
    for (let i = 1; i < rows.length; i++) { // Start from index 1 to skip header
      const row = rows[i];
      const idInSheet = row[0]; // Column A: licenseeId

      if (idInSheet && typeof idInSheet === 'string' && idInSheet.trim().toLowerCase() === licenseeId.trim().toLowerCase()) {
        console.log(`[GoogleSheets] Found matching row for ${licenseeId} at index ${i}`);
        const membershipId = row[1]; // Column B: WhopMembershipID
        const accountCountStr = row[2]; // Column C: Number of accounts

        if (!membershipId || typeof membershipId !== 'string' || membershipId.trim() === '') {
            console.error(`[GoogleSheets] Invalid or missing Membership ID for ${licenseeId} in row ${i+1}`);
            throw new Error(`Invalid or missing Membership ID found for licensee ${licenseeId}.`);
        }
        if (!accountCountStr || isNaN(parseInt(accountCountStr, 10))) {
             console.error(`[GoogleSheets] Invalid or missing Account Count for ${licenseeId} in row ${i+1}`);
            throw new Error(`Invalid or missing Account Count found for licensee ${licenseeId}.`);
        }

        const accountCount = parseInt(accountCountStr, 10);

        console.log(`[GoogleSheets] Data found: membershipId=${membershipId}, accountCount=${accountCount}`);
        return { membershipId: membershipId.trim(), accountCount };
      }
    }

    // If loop completes without finding a match
    console.log(`[GoogleSheets] Licensee ID ${licenseeId} not found in the sheet.`);
    throw new Error(`Licensee ID ${licenseeId} not found.`);

  } catch (error: any) {
    console.error('[GoogleSheets] Error fetching data:', error);
    // Rethrow specific errors or a generic one
    if (error.message.includes('not found') || error.message.includes('Invalid')) {
        throw error; // Rethrow specific validation errors
    }
     if (error.response && error.response.data && error.response.data.error) {
        // Handle potential Google API errors
        const apiError = error.response.data.error;
        console.error('[GoogleSheets] Google API Error Details:', apiError);
        throw new Error(`Google API Error: ${apiError.message} (Status: ${apiError.code}, Reason: ${apiError.status})`);
    }
    throw new Error(`Failed to retrieve data from Google Sheets: ${error.message || 'Unknown error'}`);
  }
} 