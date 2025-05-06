'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCw, Lock, AlertTriangle, Copy, Check } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

const VAT_RATE = 0.22; // 22% VAT

function calculateRemainingDays(renewalTimestamp: number | null): number | null {
    if (!renewalTimestamp) return null;
    const now = Math.floor(Date.now() / 1000);
    const remainingSeconds = renewalTimestamp - now;
    if (remainingSeconds <= 0) return 0;
    return Math.ceil(remainingSeconds / (60 * 60 * 24));
}

function SummaryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // State
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [terminationConfirmed, setTerminationConfirmed] = useState(false);

    // Extract data - Updated for dynamic plan flow
    const licenseeId = searchParams.get('licenseeId');
    const membershipId = searchParams.get('membershipId'); // Needed for termination
    const accountCountStr = searchParams.get('accountCount'); // Old account count
    const nextCycleInfo = searchParams.get('nextCycleInfo'); // Formatted date of old renewal
    // const promoCode = searchParams.get('promoCode'); // Removed
    // const newPlanId = searchParams.get('newPlanId'); // Removed (generated in backend now)
    const renewalTimestamp = searchParams.get('renewalTimestamp') ? parseInt(searchParams.get('renewalTimestamp')!, 10) : null; // Old renewal timestamp
    // const netChargeTodayPreVat = searchParams.get('netChargeToday') ? parseFloat(searchParams.get('netChargeToday')!) : null; // Replaced
    // const targetPricePerAccountPreVat = searchParams.get('targetPrice') ? parseFloat(searchParams.get('targetPrice')!) : null; // Replaced
    const fullName = searchParams.get('fullName'); 
    // Extract new fields
    const remainingDays = searchParams.get('remainingDays') ? parseInt(searchParams.get('remainingDays')!, 10) : null;
    const proratedInitialChargePreVat = searchParams.get('proratedInitialChargePreVat') ? parseFloat(searchParams.get('proratedInitialChargePreVat')!) : null;
    const newRenewalPricePreVat = searchParams.get('newRenewalPricePreVat') ? parseFloat(searchParams.get('newRenewalPricePreVat')!) : null;
    // Extract echoed form data
    const email = searchParams.get('email');
    const companyName = searchParams.get('companyName');
    const firstName = searchParams.get('firstName');
    const lastName = searchParams.get('lastName');
    const rawPhone = searchParams.get('rawPhone');
    const companyWebsite = searchParams.get('companyWebsite');
    const companyLogoUrl = searchParams.get('companyLogoUrl');

    // Calculations - Use new price fields
    const currentAccountCount = accountCountStr ? parseInt(accountCountStr, 10) : null;
    // remainingDays is already extracted
    let chargeTodayWithVat: number | null = null;
    let nextCyclePriceWithVat: number | null = null;
    let nextCycleAccountCount: number | null = null;

    if (proratedInitialChargePreVat !== null && newRenewalPricePreVat !== null && currentAccountCount !== null) {
        chargeTodayWithVat = proratedInitialChargePreVat * (1 + VAT_RATE);
        nextCycleAccountCount = currentAccountCount + 1;
        // Use the full renewal price calculated by backend
        nextCyclePriceWithVat = newRenewalPricePreVat * (1 + VAT_RATE);
    }

    // useEffect validation - Update checks for new parameters
    useEffect(() => {
        if (!licenseeId || !membershipId || currentAccountCount === null || renewalTimestamp === null || remainingDays === null || proratedInitialChargePreVat === null || newRenewalPricePreVat === null || !fullName || !email || !companyName || !firstName || !lastName || !rawPhone || !companyWebsite || !companyLogoUrl) {
            console.error("Summary page loaded without required parameters (Dynamic Plan Flow). Redirecting...");
            router.replace('/');
        }
    }, [licenseeId, membershipId, currentAccountCount, renewalTimestamp, remainingDays, proratedInitialChargePreVat, newRenewalPricePreVat, fullName, email, companyName, firstName, lastName, rawPhone, companyWebsite, companyLogoUrl, router]);

    const handleCopyCode = () => {}; // Placeholder or remove

    // Updated handler for multi-step process (Terminate -> Create Plan & Checkout -> Navigate)
    const handleProceedToCheckout = async () => {
        // Add checks for new necessary data like prices and remainingDays
        if (!licenseeId || !membershipId || !renewalTimestamp || currentAccountCount === null || remainingDays === null || proratedInitialChargePreVat === null || newRenewalPricePreVat === null) { 
            setErrorMessage('Informazioni essenziali mancanti (ID/Prezzi/Giorni). Torna indietro e riprova.');
            return;
        }
        if (!terminationConfirmed) {
            setErrorMessage('Devi confermare l\'annullamento dell\'iscrizione attuale per procedere.');
            return;
        }

        setIsLoading(true);
        setSubmissionMessage("In corso: Annullamento iscrizione attuale..."); 
        setErrorMessage(null);

        try {
            // --- Step 1: Terminate Old Membership --- 
            const terminateFormData = new FormData();
            terminateFormData.append('membershipId', membershipId);
            terminateFormData.append('upgradeFlowActive', 'true'); 
            console.log(`[Summary Page] Attempting termination for: ${membershipId}`);
            const terminateResponse = await fetch('/api/checkout?step=terminateMembership', { method: 'POST', body: terminateFormData });
            const terminateResult = await terminateResponse.json();
            if (!terminateResponse.ok || !terminateResult.success) {
                throw new Error(terminateResult.error || "Errore durante l'annullamento dell'iscrizione attuale.");
            }

            console.log("[Summary Page] Termination successful.");
            setSubmissionMessage('Annullamento completato. Creazione nuovo piano e checkout...'); // Update message

            // --- Step 2: Create New Plan & Checkout Session --- 
            const createPlanFormData = new FormData();
            // Identifiers
            createPlanFormData.append('licenseeId', licenseeId);
            createPlanFormData.append('oldMembershipId', membershipId); 
            createPlanFormData.append('oldRenewalTimestamp', renewalTimestamp.toString());
            // Calculation inputs
            createPlanFormData.append('accountCount', currentAccountCount.toString()); // Send OLD count
            createPlanFormData.append('remainingDays', remainingDays.toString());
            createPlanFormData.append('proratedInitialChargePreVat', proratedInitialChargePreVat.toString());
            createPlanFormData.append('newRenewalPricePreVat', newRenewalPricePreVat.toString());
            // User details for metadata
            if (email) createPlanFormData.append('email', email);
            if (companyName) createPlanFormData.append('companyName', companyName);
            if (firstName) createPlanFormData.append('firstName', firstName);
            if (lastName) createPlanFormData.append('lastName', lastName);
            if (rawPhone) createPlanFormData.append('rawPhone', rawPhone);
            if (companyWebsite) createPlanFormData.append('companyWebsite', companyWebsite);
            if (companyLogoUrl) createPlanFormData.append('companyLogoUrl', companyLogoUrl);
            // Flag for backend step logic
            createPlanFormData.append('upgradeFlowActive', 'true');

            console.log("[Summary Page] Creating new plan and checkout session...");
            const checkoutResponse = await fetch('/api/checkout?step=createPlanAndCheckout', { // Use new step
                method: 'POST',
                body: createPlanFormData,
            });
            const checkoutResult = await checkoutResponse.json();

            if (!checkoutResponse.ok) {
                throw new Error(checkoutResult.error || 'Errore durante la creazione del nuovo piano/checkout.');
            }

            if (checkoutResult.purchase_url) {
                setSubmissionMessage('Operazione completata! Verrai reindirizzato al nuovo checkout...');
                window.location.href = checkoutResult.purchase_url;
            } else {
                throw new Error('URL di acquisto non ricevuto dal server.');
            }
        } catch (err: unknown) {
            console.error("Error during upgrade process:", err);
            let message = "Errore durante il processo di upgrade.";
            if (err instanceof Error) message = err.message;
            setErrorMessage(message);
            setSubmissionMessage(null);
            setIsLoading(false);
        }
    };

    // Loading/Redirect check (update with new params)
    if (!licenseeId || !membershipId || currentAccountCount === null /* ... add other new params ... */ ) {
        // ... loading JSX ...
    }

    // Main content rendering - Update UI text
    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-4">
             {/* Background */} 
             <div className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url(/bg-licensee.jpg)' }} >
                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
             </div>
            <main className="relative z-10 flex flex-col items-center justify-center w-full">
                 {/* Logo */} 
                 <div className="mb-8">
                    <Image src="/licensee-logo.jpg" alt="Licensee Logo" width={100} height={100} className="rounded-lg shadow-lg" priority />
                 </div>
                <div className="glass-effect rounded-xl p-6 sm:p-8 w-full max-w-lg">
                     {/* Title */} 
                     <h1 className={cn("text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-center", "text-[#FB6248] [text-shadow:0_0_12px_#FB6248aa]")}>
                         Riepilogo Upgrade Licenza
                     </h1>
                     {/* Error/Submission Messages */} 
                     {errorMessage && (
                         <div className="mb-4 p-3 text-sm text-red-200 rounded-lg bg-destructive/20 border border-destructive/50" role="alert">
                             <span className="font-medium">Errore:</span> {errorMessage}
                         </div>
                     )}
                     {submissionMessage && !errorMessage && (
                         <div className="mb-4 p-3 text-sm text-blue-300 rounded-lg bg-blue-600/20 border border-blue-500/50" role="status">
                             {submissionMessage}
                         </div>
                     )}
                    <div className="space-y-5 text-white/90">
                        {/* Account Info Section */} 
                        <div>
                             <p className="font-medium text-lg mb-2">Dettagli Account:</p>
                              <ul className="list-none space-y-1 bg-white/5 p-4 rounded-md border border-white/10 text-sm">
                                <li><strong>Nome Completo:</strong> {fullName || 'N/D'}</li>
                                <li><strong>ID Licenza:</strong> <span className="font-mono text-muted-foreground">{licenseeId}</span></li>
                                <li className="pt-2 border-t border-white/10"><strong>Account Attivi Attuali:</strong> {currentAccountCount}</li>
                                <li>
                                    <strong>Prossimo Rinnovo Attuale:</strong>
                                    {nextCycleInfo || 'N/D'}
                                    {remainingDays !== null && remainingDays >= 0 && (
                                         <span className="text-xs text-muted-foreground ml-2">({remainingDays} {remainingDays === 1 ? 'giorno rimanente' : 'giorni rimanenti'})</span>
                                    )}
                                </li>
                             </ul>
                         </div>
                        {/* Upgrade Goal */} 
                         <p className="text-center text-base">
                             Stai effettuando l'upgrade per aggiungere 1 account, per un totale di <span className="font-semibold text-[#FB6248]">{nextCycleAccountCount ?? '...'}</span> account.
                         </p>
                         {/* Billing Summary WITH VAT - Updated Calculations & Text */} 
                        <div className="bg-white/5 p-4 rounded-md border border-white/10 space-y-3 text-sm">
                            <h3 className="font-semibold text-base text-white mb-2">Riepilogo Costi (IVA 22% inclusa):</h3>
                            {chargeTodayWithVat !== null ? (
                                <div className="flex justify-between items-center">
                                     {/* Updated text for initial charge */} 
                                     <span className="text-muted-foreground">Costo Iniziale Upgrade Oggi <br/> 
                                       <span className="text-xs">(Prorata per {remainingDays !== null && remainingDays >= 0 ? `${remainingDays} ${remainingDays === 1 ? 'giorno' : 'giorni'}` : '...'} rimanenti)</span>
                                     </span>
                                     <span className="font-semibold text-lg text-white">€{chargeTodayWithVat.toFixed(2)}</span>
                                 </div>
                            ) : null}
                            {nextCyclePriceWithVat !== null && nextCycleAccountCount !== null ? (
                                 <div className="flex justify-between items-center border-t border-white/10 pt-2 mt-2">
                                     {/* Updated text for next cycle */} 
                                     <span className="text-muted-foreground">Prossimo Ciclo (dal {nextCycleInfo || 'N/D'})<br/>
                                       <span className="text-xs">({nextCycleAccountCount} account - Primo rinnovo dopo {remainingDays !== null ? remainingDays : '...'} giorni di prova)</span>
                                     </span>
                                     <span className="font-semibold text-lg text-white">€{nextCyclePriceWithVat.toFixed(2)}</span>
                                 </div>
                            ) : null}
                             <p className="text-xs text-muted-foreground mt-2">
                                 {nextCycleInfo && nextCycleAccountCount !== null ? 
                                     `Verrà addebitato il costo iniziale oggi. Il primo rinnovo avverrà il ${nextCycleInfo} al prezzo indicato per ${nextCycleAccountCount} account.` :
                                     'Dettagli prossimo ciclo non disponibili.'
                                 }
                             </p>
                         </div>
                         {/* REMOVED Promo Code Section */} 
                         {/* --- Termination Confirmation Checkbox --- */} 
                         <div className="items-top flex space-x-2 pt-2 border-t border-white/10">
                           <Checkbox 
                             id="termination-confirm" 
                             checked={terminationConfirmed} 
                             onCheckedChange={(checked) => setTerminationConfirmed(checked as boolean)}
                             disabled={isLoading}
                             aria-describedby="termination-confirm-label"
                           />
                           <div className="grid gap-1.5 leading-none">
                             <Label
                               htmlFor="termination-confirm"
                               id="termination-confirm-label"
                               className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                             >
                               Confermo di voler annullare immediatamente la mia iscrizione attuale per procedere con l'upgrade.
                             </Label>
                             <p className="text-xs text-muted-foreground">
                               Questa azione è irreversibile. Dovrai completare il nuovo checkout per attivare il piano aggiornato.
                             </p>
                           </div>
                         </div>
                         {/* Action Button */} 
                         <Button
                             type="button"
                             onClick={handleProceedToCheckout}
                             disabled={isLoading || !terminationConfirmed}
                             className={cn(
                                 "w-full text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-md shadow-md transition duration-300 ease-in-out transform hover:scale-105 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed",
                                 "bg-[#FB6248] hover:bg-[#E05840]",
                                 "shadow-[0_0_18px_#FB624888] hover:shadow-[0_0_22px_#FB6248aa]"
                             )}
                         >
                             {isLoading ? (
                                 <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Elaborazione...</>
                             ) : (
                                 <><Lock className="mr-2 h-4 w-4" /> Procedi all'Upgrade</>
                             )}
                          </Button>
                     </div>
                </div>
            </main>
        </div>
    );
}

// Default export with Suspense
export default function SummaryPage() {
    return (
        <Suspense fallback={
            <div className="relative min-h-screen w-full flex items-center justify-center p-4 text-white">
                {/* Background */}
                <div
                    className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: 'url(/bg-licensee.jpg)' }}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                </div>
                {/* Loading indicator */}
                <div className="relative z-10 flex items-center space-x-2">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Caricamento dati riepilogo...</span>
                </div>
            </div>
        }>
            <SummaryContent />
        </Suspense>
    );
} 