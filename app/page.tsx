'use client';

import React from 'react';
import { useState } from 'react';
import Image from 'next/image';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { RefreshCw, Lock, XCircle } from 'lucide-react';
import { Switch } from "@/components/ui/switch";

// Helper function to format phone number
const formatPhoneNumber = (digits: string): string => {
  const cleaned = digits.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (match) {
    return !match[2]
      ? match[1]
      : `${match[1]} ${match[2]}${match[3] ? ` ${match[3]}` : ''}`;
  }
  return digits;
};

// Define form data and error types
interface FormData {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  rawPhone: string;
  companyWebsite: string;
  companyLogoUrl: string;
  licenseeId: string;
}

interface FormErrors {
  companyName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  licenseeId?: string;
  general?: string;
}

export default function WhopCheckoutPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isExistingLicensee, setIsExistingLicensee] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    rawPhone: '',
    companyWebsite: '',
    companyLogoUrl: '',
    licenseeId: '',
  });
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);

  // Validation function
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    let isValid = true;

    if (isExistingLicensee) {
      if (!formData.licenseeId) {
        errors.licenseeId = 'ID Licenza è obbligatorio.';
        isValid = false;
      }
    } else {
      if (!formData.companyName) {
        errors.companyName = "Nome agenzia è obbligatorio.";
        isValid = false;
      }
      if (!formData.companyWebsite) {
        errors.companyWebsite = "Sito web aziendale è obbligatorio.";
        isValid = false;
      }
      if (!formData.companyLogoUrl) {
        errors.companyLogoUrl = "URL Logo aziendale è obbligatorio.";
        isValid = false;
      }
      if (!formData.firstName) {
        errors.firstName = 'Nome è obbligatorio.';
        isValid = false;
      }
      if (!formData.lastName) {
        errors.lastName = 'Cognome è obbligatorio.';
        isValid = false;
      }
      if (!formData.email) {
        errors.email = 'Email è obbligatoria.';
        isValid = false;
      } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
        errors.email = 'Formato email non valido.';
        isValid = false;
      }
      if (!formData.rawPhone) {
        errors.phone = 'Numero di telefono è obbligatorio.';
        isValid = false;
      } else if (formData.rawPhone.length < 9 || formData.rawPhone.length > 10) {
        errors.phone = 'Inserisci un numero di telefono valido (9-10 cifre).';
        isValid = false;
      }
    }

    setFormErrors(errors);
    return isValid;
  };

  // Input change handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name as keyof Omit<FormErrors, 'general'>]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (formErrors.general) {
      setFormErrors((prev) => ({ ...prev, general: undefined }));
    }
  };

  const handlePhoneInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputDigits = event.target.value.replace(/\D/g, '');
    const newRawPhone = inputDigits.slice(0, 10);
    setFormData((prev) => ({ ...prev, rawPhone: newRawPhone }));
    if (formErrors.phone) {
      setFormErrors((prev) => ({ ...prev, phone: undefined }));
    }
    if (formErrors.general) {
      setFormErrors((prev) => ({ ...prev, general: undefined }));
    }
  };

  const handleToggleChange = (checked: boolean) => {
    setIsExistingLicensee(checked);
    setFormErrors({});
    setSubmissionMessage(null);
    if (!checked) {
      setFormData((prev) => ({ ...prev, licenseeId: '' }));
    }
  };

  // Submit handler
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }
    setIsLoading(true);
    setSubmissionMessage(null);
    setFormErrors({});
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (isExistingLicensee) {
      const submissionData = {
        ...formData,
        isClientActivation: true
      };
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submissionData),
        });
        const result = await response.json();

        if (!response.ok) {
          setFormErrors({ general: result.error || 'Errore durante l\'attivazione del cliente.' });
          throw new Error(result.error || 'Errore durante l\'attivazione del cliente.');
        }

        if (result.purchase_url) {
          setSubmissionMessage('Cliente attivato con successo! Verrai reindirizzato...');
          window.location.href = result.purchase_url;
        } else {
          setSubmissionMessage(result.message || 'Cliente attivato con successo!');
        }
      } catch (err: unknown) {
        console.error('Client activation error:', err);
        let message = 'Impossibile attivare il cliente.';
        if (err instanceof Error) {
          message = err.message;
        }
        setFormErrors((prev) => ({ ...prev, general: message }));
      } finally {
        if (!submissionMessage?.includes('reindirizzato')) {
           setIsLoading(false);
        }
      }
    } else {
      const { licenseeId, ...submissionData } = formData;
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submissionData),
        });
        const result = await response.json();
        if (!response.ok) {
          setFormErrors({ general: result.error || 'Si è verificato un errore sconosciuto.' });
          throw new Error(result.error || 'Si è verificato un errore sconosciuto.');
        }
        if (result.purchase_url) {
          setSubmissionMessage('Verrai reindirizzato alla pagina di pagamento...');
          window.location.href = result.purchase_url;
        } else {
          setFormErrors({ general: 'URL di acquisto non ricevuto.' });
          throw new Error('URL di acquisto non ricevuto.');
        }
      } catch (err: unknown) {
        console.error('Form submission error:', err);
        let message = 'Impossibile elaborare la richiesta.';
        if (err instanceof Error) {
          message = err.message;
        }
        setFormErrors((prev) => ({ ...prev, general: message }));
        setSubmissionMessage(null);
      } finally {
        if (!submissionMessage?.includes('reindirizzato')) {
           setIsLoading(false);
        }
      }
    }
  };

  // Main structure with background image
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-4">
      {/* Background Image & Overlay */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/bg-licensee.jpg)' }}
      >
        {/* Dark overlay for better text contrast */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      </div>

      {/* Foreground Content Area */}
      <main className="relative z-10 flex flex-col items-center justify-center w-full">
        {/* Logo */} 
        <div className="mb-8"> {/* Adjusted margin */}
          <Image
            src="/licensee-logo.jpg"
            alt="Licensee Logo"
            width={100} // Adjusted size for potentially smaller screens too
            height={100}
            className="rounded-lg shadow-lg"
            priority
          />
        </div>

        {/* Form Container with Enhanced Glass Effect */} 
        <div className="glass-effect rounded-xl p-6 sm:p-8 w-full max-w-lg">
          {/* Conditional Neon Title with specific color #FB6248 */}
          <h1 className={cn(
            "text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-center",
            "text-[#FB6248] [text-shadow:0_0_12px_#FB6248aa]" // Use specific hex code and adjust shadow
            )}>
             {isExistingLicensee ? 'Attiva il tuo cliente' : 'Diventa Licensee'}
          </h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-5 sm:space-y-6">
            {/* Mode Toggle Switch with specific color #FB6248 */}
            <div className="flex items-center justify-between space-x-2 pb-4 border-b border-white/10 mb-4">
              <Label
                htmlFor="existingLicenseeToggle"
                className={cn(
                  "text-sm font-medium leading-none text-muted-foreground cursor-pointer transition-colors",
                  isExistingLicensee && "text-[#FB6248]" // Label color when active
                )}
              >
                Vuoi attivare un cliente? Attivalo qui.
              </Label>
              <Switch
                id="existingLicenseeToggle"
                checked={isExistingLicensee}
                onCheckedChange={handleToggleChange}
                disabled={isLoading}
                className={cn(
                  "data-[state=unchecked]:bg-input",
                  "data-[state=checked]:bg-[#FB6248]", // Use specific hex code for checked background
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "focus-visible:ring-[#FB6248]" // Use specific hex code for focus ring
                )}
              />
            </div>

            {formErrors.general && (
                <div className="p-3 text-sm text-red-200 rounded-lg bg-destructive/20 border border-destructive/50" role="alert">
                  <span className="font-medium">Errore:</span> {formErrors.general}
                </div>
            )}
            {submissionMessage && !formErrors.general && (
                <div className="p-3 text-sm text-blue-300 rounded-lg bg-blue-600/20 border border-blue-500/50" role="status">
                  {submissionMessage}
                </div>
            )}

            {/* === Licensee ID Field (Conditionally Enabled/Required) === */}
             <div className={cn("space-y-2", !isExistingLicensee && "opacity-50")}>
                {/* Label */}
                <Label htmlFor="licenseeId" className={cn("text-xs sm:text-sm font-medium text-muted-foreground", !isExistingLicensee && "text-muted-foreground/70")}>
                  LicenseeID {isExistingLicensee ? '*' : ''}
                </Label>
                {/* Description Text (Moved Before Input) */}
                <p id="licenseeId-description" className={cn("text-xs text-muted-foreground/80", !isExistingLicensee && "text-muted-foreground/50")}>
                  Il tuo LicenseeID corrisponde al &apos;Location ID&apos; del tuo Sub-Account GoHighLevel.
                  {' '}
                  <a href="https://help.gohighlevel.com/support/solutions/articles/48001204848-how-do-i-find-my-client-s-location-id-" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#FB6248] transition-colors">
                    Scopri come trovarlo qui
                  </a>.
                </p>
                {/* Input Field */}
                <Input
                  id="licenseeId"
                  name="licenseeId"
                  placeholder="Il tuo LicenseeID esistente"
                  required={isExistingLicensee}
                  value={formData.licenseeId}
                  onChange={handleInputChange}
                  className={cn(
                    "bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[#FB6248] focus:border-[#FB6248] text-sm sm:text-base",
                    formErrors.licenseeId && "border-destructive focus:ring-destructive focus:border-destructive",
                    !isExistingLicensee && "cursor-not-allowed border-border/50"
                    )}
                  aria-invalid={!!formErrors.licenseeId}
                  aria-describedby={formErrors.licenseeId ? "licenseeId-error" : "licenseeId-description"} // Keep aria-describedby pointing to description
                  disabled={isLoading || !isExistingLicensee}
                />
                {/* Error Message (Remains at the end) */}
                {isExistingLicensee && formErrors.licenseeId && <p id="licenseeId-error" className="text-xs text-destructive mt-1">{formErrors.licenseeId}</p>}
              </div>

            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs sm:text-sm font-medium text-muted-foreground">Nome dell&apos;agenzia*</Label>
              <Input id="companyName" name="companyName" placeholder="es. Madani Corp" required value={formData.companyName} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.companyName && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.companyName} aria-describedby={formErrors.companyName ? "companyName-error" : undefined} disabled={isLoading} />
              {formErrors.companyName && <p id="companyName-error" className="text-xs text-destructive mt-1">{formErrors.companyName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyWebsite" className="text-xs sm:text-sm font-medium text-muted-foreground">Sito web aziendale*</Label>
              <Input id="companyWebsite" name="companyWebsite" type="url" placeholder="https://madani.agency" required value={formData.companyWebsite} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.companyWebsite && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.companyWebsite} aria-describedby={formErrors.companyWebsite ? "companyWebsite-error" : undefined} disabled={isLoading} />
              {formErrors.companyWebsite && <p id="companyWebsite-error" className="text-xs text-destructive mt-1">{formErrors.companyWebsite}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyLogoUrl" className="text-xs sm:text-sm font-medium text-muted-foreground">URL Logo aziendale*</Label>
              <p className="text-xs text-muted-foreground/80">
                Non hai un link diretto? Carica il logo su <a href="https://imgbb.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">ImgBB.com</a> e incolla qui il "Link diretto".
              </p>
              <Input id="companyLogoUrl" name="companyLogoUrl" type="url" placeholder="https://ibb.co/7NjCmmmR" required value={formData.companyLogoUrl} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.companyLogoUrl && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.companyLogoUrl} aria-describedby={formErrors.companyLogoUrl ? "companyLogoUrl-error" : undefined} disabled={isLoading} />
              {formErrors.companyLogoUrl && <p id="companyLogoUrl-error" className="text-xs text-destructive mt-1">{formErrors.companyLogoUrl}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-xs sm:text-sm font-medium text-muted-foreground">Nome*</Label>
                <Input id="firstName" name="firstName" placeholder="Mario" required value={formData.firstName} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.firstName && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.firstName} aria-describedby={formErrors.firstName ? "firstname-error" : undefined} disabled={isLoading} />
                {formErrors.firstName && <p id="firstname-error" className="text-xs text-destructive mt-1">{formErrors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-xs sm:text-sm font-medium text-muted-foreground">Cognome*</Label>
                <Input id="lastName" name="lastName" placeholder="Rossi" required value={formData.lastName} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.lastName && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.lastName} aria-describedby={formErrors.lastName ? "lastname-error" : undefined} disabled={isLoading} />
                {formErrors.lastName && <p id="lastname-error" className="text-xs text-destructive mt-1">{formErrors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-muted-foreground">Email*</Label>
                <Input id="email" name="email" type="email" placeholder="mario.rossi@email.com" required value={formData.email} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.email && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.email} aria-describedby={formErrors.email ? "email-error" : undefined} disabled={isLoading} />
                {formErrors.email && <p id="email-error" className="text-xs text-destructive mt-1">{formErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-muted-foreground">Numero di telefono*</Label>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted text-muted-foreground text-xs sm:text-sm h-9 sm:h-10">+39</span>
                  <Input id="phone" name="phone" type="tel" inputMode="numeric" placeholder="123 456 7890" required value={formatPhoneNumber(formData.rawPhone)} onChange={handlePhoneInput} className={cn("flex-1 bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] rounded-l-none text-sm sm:text-base h-9 sm:h-10", formErrors.phone && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.phone} aria-describedby={formErrors.phone ? "phone-error" : undefined} disabled={isLoading} />
                </div>
                {formErrors.phone && <p id="phone-error" className="text-xs text-destructive mt-1">{formErrors.phone}</p>}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-md shadow-md transition duration-300 ease-in-out transform hover:scale-105 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed",
                "bg-[#FB6248] hover:bg-[#E05840]", // Use specific hex code for bg, maybe slightly darker on hover
                "shadow-[0_0_18px_#FB624888] hover:shadow-[0_0_22px_#FB6248aa]" // Use specific hex code for shadow halo, enhance on hover
              )}
             >
                <span className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-all duration-700 ease-in-out group-hover:left-[100%]"></span>
                {isLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {isExistingLicensee ? 'Attivazione Cliente...' : 'Attivazione Licenza...'}
                    </>
                ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      {isExistingLicensee ? 'Attiva Cliente' : 'Attiva Licenza'}
                    </>
                )}
             </Button>
          </form>
        </div>
      </main>
    </div>
  );
} 