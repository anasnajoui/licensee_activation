'use client';

import React from 'react';
import { useState } from 'react';
import Image from 'next/image';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { RefreshCw, Lock, XCircle } from 'lucide-react';

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
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  general?: string;
}

export default function WhopCheckoutPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    rawPhone: '',
    companyWebsite: '',
    companyLogoUrl: '',
  });
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);

  // Validation function
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    let isValid = true;
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

  // Submit handler
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }
    setIsLoading(true);
    setSubmissionMessage(null);
    setFormErrors({});
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate delay
    const submissionData = {
      companyName: formData.companyName,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.rawPhone,
      companyWebsite: formData.companyWebsite,
      companyLogoUrl: formData.companyLogoUrl,
    };
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
      setIsLoading(false);
      setSubmissionMessage(null);
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
          {/* Neon Red Title - REMOVED */}
          {/* 
          <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-center text-glow-neon-red">
            Licensee Activation
          </h1>
          */}

          <form onSubmit={handleSubmit} noValidate className="space-y-5 sm:space-y-6">
            {/* Error/Submission Messages */} 
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

            {/* Input Fields */} 
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs sm:text-sm font-medium text-muted-foreground">Nome dell&apos;agenzia <span className="text-xs">(facoltativo)</span></Label>
              <Input id="companyName" name="companyName" placeholder="es. Madani Corp" value={formData.companyName} onChange={handleInputChange} className="bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base" disabled={isLoading} />
            </div>
            {/* Company Website */}
            <div className="space-y-2">
              <Label htmlFor="companyWebsite" className="text-xs sm:text-sm font-medium text-muted-foreground">Sito web aziendale <span className="text-xs">(facoltativo)</span></Label>
              <Input id="companyWebsite" name="companyWebsite" type="url" placeholder="https://madani.agency" value={formData.companyWebsite} onChange={handleInputChange} className="bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base" disabled={isLoading} />
            </div>
            {/* Company Logo URL */}
            <div className="space-y-2">
              <Label htmlFor="companyLogoUrl" className="text-xs sm:text-sm font-medium text-muted-foreground">URL Logo aziendale <span className="text-xs">(facoltativo)</span></Label>
              <Input id="companyLogoUrl" name="companyLogoUrl" type="url" placeholder="https://madani.agency/logo.png" value={formData.companyLogoUrl} onChange={handleInputChange} className="bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base" disabled={isLoading} />
            </div>

            {/* SPLIT NAME FIELDS */} 
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* First Name */}
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-xs sm:text-sm font-medium text-muted-foreground">Nome*</Label>
                <Input id="firstName" name="firstName" placeholder="Mario" required value={formData.firstName} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.firstName && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.firstName} aria-describedby={formErrors.firstName ? "firstname-error" : undefined} disabled={isLoading} />
                {formErrors.firstName && <p id="firstname-error" className="text-xs text-destructive mt-1">{formErrors.firstName}</p>}
              </div>
              {/* Last Name */} 
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-xs sm:text-sm font-medium text-muted-foreground">Cognome*</Label>
                <Input id="lastName" name="lastName" placeholder="Rossi" required value={formData.lastName} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.lastName && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.lastName} aria-describedby={formErrors.lastName ? "lastname-error" : undefined} disabled={isLoading} />
                {formErrors.lastName && <p id="lastname-error" className="text-xs text-destructive mt-1">{formErrors.lastName}</p>}
              </div>
            </div>

             {/* Email Field */} 
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-muted-foreground">Email*</Label>
              <Input id="email" name="email" type="email" placeholder="mario.rossi@email.com" required value={formData.email} onChange={handleInputChange} className={cn("bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] text-sm sm:text-base", formErrors.email && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.email} aria-describedby={formErrors.email ? "email-error" : undefined} disabled={isLoading} />
              {formErrors.email && <p id="email-error" className="text-xs text-destructive mt-1">{formErrors.email}</p>}
            </div>

            {/* Phone Field */} 
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-muted-foreground">Numero di telefono*</Label>
              <div className="flex items-center">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted text-muted-foreground text-xs sm:text-sm h-9 sm:h-10">+39</span>
                <Input id="phone" name="phone" type="tel" inputMode="numeric" placeholder="123 456 7890" required value={formatPhoneNumber(formData.rawPhone)} onChange={handlePhoneInput} className={cn("flex-1 bg-input border-border placeholder-muted-foreground/50 focus:ring-1 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] rounded-l-none text-sm sm:text-base h-9 sm:h-10", formErrors.phone && "border-destructive focus:ring-destructive focus:border-destructive")} aria-invalid={!!formErrors.phone} aria-describedby={formErrors.phone ? "phone-error" : undefined} disabled={isLoading} />
              </div>
              {formErrors.phone && <p id="phone-error" className="text-xs text-destructive mt-1">{formErrors.phone}</p>}
            </div>

            {/* Submit Button */} 
            <div className="pt-4 sm:pt-6">
              <Button type="submit" className="btn-neon" disabled={isLoading || (!!submissionMessage && !formErrors.general)} >
                {isLoading ? (
                    <>
                      <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                      Elaborazione...
                    </>
                ) : (
                    "Attiva Licenza"
                )}
              </Button>
            </div>

             {/* Security Footer */} 
            <div className="text-center w-full pt-2 sm:pt-4">
              <div className="flex items-center justify-center gap-2 sm:gap-3 text-xs text-muted-foreground/80">
                <span className="flex items-center gap-1"><Lock className="h-3 w-3"/> Pagamento sicuro</span>
                <span>|</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3"/> Dati protetti</span>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
} 