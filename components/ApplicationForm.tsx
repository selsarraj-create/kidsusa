"use client"

import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Lock, ShieldCheck, ChevronRight, User, MapPin, Phone, Calendar } from 'lucide-react'
import { motion } from 'framer-motion'

import { Input } from './ui/input'
import { Button } from './ui/button'
import { ImageUpload } from './ImageUpload'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const formSchema = z.object({
    firstName: z.string().min(2, "First name is too short"),
    lastName: z.string().min(2, "Last name is too short"),
    age: z.string().regex(/^\d+$/, "Age must be a number"),
    phone: z.string().refine((val) => {
        const digits = val.replace(/\D/g, '')
        return digits.length === 10 && !digits.startsWith('1')
    }, "Please enter a valid 10-digit number (cannot start with 1)"),
    zipCode: z.string().min(5, "Please enter a valid Zip Code").max(10, "Zip Code too long"),
    image: z.custom<File>((v) => v instanceof File, {
        message: "Please upload a photo of your child",
    }),
})

type FormValues = z.infer<typeof formSchema>

export function ApplicationForm() {
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    })

    // Basic Input Masking Logic (US Phone)
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '')

        // Prevent starting with 1
        if (val.startsWith('1')) {
            val = val.substring(1)
        }

        if (val.length > 10) val = val.slice(0, 10)

        // Format as (XXX) XXX-XXXX
        if (val.length > 6) {
            val = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`
        } else if (val.length > 3) {
            val = `(${val.slice(0, 3)}) ${val.slice(3)}`
        } else if (val.length > 0) {
            val = `(${val}`
        }

        setValue('phone', val, { shouldValidate: true })
    }

    // US Zip Code Logic
    const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '') // Numeric only for basic 5-digit US zip
        if (val.length > 5) val = val.slice(0, 5) // Restrict to 5 digits for simplicity

        setValue('zipCode', val, { shouldValidate: true })
    }

    const onSubmit = async (data: FormValues) => {
        try {
            console.log("Submitting to Supabase...", data)

            // 1. Upload Image to Supabase Storage
            const file = data.image
            const fileExt = file.name.split('.').pop()
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
            const filePath = `${fileName}`

            // Ensure bucket exists or handle error (Assuming bucket 'leads' exists per plan)
            const { error: uploadError } = await supabase.storage
                .from('leads')
                .upload(filePath, file)

            if (uploadError) {
                console.error("Upload error:", uploadError)
                throw new Error("Failed to upload image")
            }

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('leads')
                .getPublicUrl(filePath)

            // 3. Insert Data into Table
            const { error: dbError } = await supabase
                .from('applications')
                .insert({
                    first_name: data.firstName,
                    last_name: data.lastName,
                    age: parseInt(data.age),
                    phone: data.phone,
                    post_code: data.zipCode, // Mapping zipCode to existing post_code column for now
                    image_url: publicUrl,
                    status: 'new'
                })

            if (dbError) {
                console.error("Database error:", dbError)
                throw new Error("Failed to save application")
            }

            // Track Conversion in GTM
            if (typeof window !== 'undefined') {
                (window as any).dataLayer = (window as any).dataLayer || [];
                (window as any).dataLayer.push({
                    'event': 'form_submission',
                    'form_name': 'application_form',
                    'status': 'success'
                });
            }

            alert("Application Received! We will be in touch.")

        } catch (error) {
            console.error("Submission failed:", error)
            alert("Something went wrong. Please try again.")
        }
    }

    const imageValue = watch('image')

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong w-full rounded-[30px] p-6 shadow-2xl backdrop-blur-xl md:p-8 border border-white/60"
        >
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-gray-900 md:text-3xl tracking-tight">
                    Apply Now
                </h2>
                <div className="flex items-center gap-1.5 rounded-full bg-green-100/80 px-3 py-1.5 text-xs font-bold text-green-700 shadow-sm ring-1 ring-green-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Secure</span>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                {/* Name Fields Row */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Input
                            {...register('firstName')}
                            placeholder="First Name"
                            icon={<User className="w-5 h-5" />}
                            className={cn("bg-white/70", errors.firstName && "border-red-500 ring-red-500")}
                        />
                        {errors.firstName && <p className="ml-1 text-xs font-bold text-red-500">{errors.firstName.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Input
                            {...register('lastName')}
                            placeholder="Last Name"
                            icon={<User className="w-5 h-5" />}
                            className={cn("bg-white/70", errors.lastName && "border-red-500 ring-red-500")}
                        />
                        {errors.lastName && <p className="ml-1 text-xs font-bold text-red-500">{errors.lastName.message}</p>}
                    </div>
                </div>

                {/* Age & Zip Code Row */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-pink/60 pointer-events-none z-10">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <select
                                className={cn(
                                    "flex h-12 w-full appearance-none rounded-2xl border-2 border-white/40 bg-white/70 pl-11 pr-4 py-2 text-base text-gray-900 shadow-sm focus-visible:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 transition-colors focus:bg-white",
                                    errors.age && "border-red-500 ring-red-500"
                                )}
                                {...register('age')}
                                defaultValue="3" // Start default at 3 per user request
                            >
                                <option value="" disabled>Age</option>
                                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((age) => (
                                    <option key={age} value={age}>{age} Years</option>
                                ))}
                            </select>
                            <ChevronRight className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-gray-500" />
                        </div>
                        {errors.age && <p className="ml-1 text-xs font-bold text-red-500">{errors.age.message}</p>}
                    </div>

                    <div className="space-y-1">
                        <Input
                            {...register('zipCode')}
                            onChange={handleZipCodeChange}
                            placeholder="Zip Code"
                            icon={<MapPin className="w-5 h-5" />}
                            className={cn("bg-white/70", errors.zipCode && "border-red-500 ring-red-500")}
                        />
                        {errors.zipCode && <p className="ml-1 text-xs font-bold text-red-500">{errors.zipCode.message}</p>}
                    </div>
                </div>

                {/* Phone */}
                <div className="space-y-1">
                    <Input
                        {...register('phone')}
                        type="tel"
                        onChange={handlePhoneChange}
                        placeholder="Phone Number (555) 555-5555"
                        icon={<Phone className="w-5 h-5" />}
                        className={cn("bg-white/70", errors.phone && "border-red-500 ring-red-500")}
                    />
                    {errors.phone && <p className="ml-1 text-xs font-bold text-red-500">{errors.phone.message}</p>}
                </div>

                {/* Image Upload */}
                <div className="space-y-1">
                    <label className="ml-1 text-sm font-bold text-gray-700">Photo Upload</label>
                    <p className="ml-1 text-xs text-gray-500 mb-1">Showcase personality! Natural light preferred.</p>
                    <ImageUpload
                        value={imageValue}
                        onChange={(file) => setValue('image', file as any, { shouldValidate: true })}
                        className={cn(errors.image && "ring-2 ring-red-500 rounded-2xl")}
                    />
                    {errors.image && <p className="ml-1 text-xs font-bold text-red-500">{errors.image.message}</p>}
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full text-lg shadow-brand-pink/40"
                        variant="primary"
                        size="lg"
                    >
                        {isSubmitting ? "Sending..." : "Submit Application"}
                    </Button>

                    <div className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-gray-500">
                        <Lock className="h-3 w-3 text-green-600" />
                        <span>SSL Encrypted. Your data is private.</span>
                    </div>
                </div>

            </form>
        </motion.div>
    )
}
