"use client"

import React, { useEffect } from 'react'
import { useForm, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { Lock, ShieldCheck, ChevronRight, User, MapPin, Phone, Calendar } from 'lucide-react'
import { motion } from 'framer-motion'


import { Input } from './ui/input'
import { Button } from './ui/button'
import { ImageUpload } from './ImageUpload'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const formSchema = z.object({
    childName: z.string().min(2, "Child's name is too short"),
    firstName: z.string().min(2, "First name is too short"),
    lastName: z.string().min(2, "Last name is too short"),
    email: z.string().email("Please enter a valid email address"),
    gender: z.enum(["M", "F"], { message: "Please select a gender" }),
    city: z.string().optional(),
    campaignCode: z.string().optional(),
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
    const [isSubmitted, setIsSubmitted] = React.useState(false)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    })

    useEffect(() => {
        // Register hidden fields
        register("campaignCode")
        register("city")
    }, [register])

    // Campaign Cities Configuration
    const CAMPAIGN_CITIES = [
        { code: '#NYKIDS', name: 'New York', lat: 40.7128, lon: -74.0060 },
        { code: '#BOSKIDS', name: 'Boston', lat: 42.3601, lon: -71.0589 },
        { code: '#FLKIDS', name: 'Miami', lat: 25.7617, lon: -80.1918 },
        { code: '#NAKIDS', name: 'Nashville', lat: 36.1627, lon: -86.7816 },
        { code: '#CHIKIDS', name: 'Chicago', lat: 41.8781, lon: -87.6298 },
        { code: '#HOUKIDS', name: 'Houston', lat: 29.7604, lon: -95.3698 },
        { code: '#DALKIDS', name: 'Dallas', lat: 32.7767, lon: -96.7970 },
    ]

    // Haversine Distance Calculation (km)
    const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    const deg2rad = (deg: number) => {
        return deg * (Math.PI / 180)
    }

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

    // US Zip Code Logic & Campaign Detection
    const handleZipCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '') // Numeric only
        if (val.length > 5) val = val.slice(0, 5)

        setValue('zipCode', val, { shouldValidate: true })

        // 5-digit zip entered? Check proximity
        if (val.length === 5) {
            try {
                const response = await fetch(`https://api.zippopotam.us/us/${val}`)
                if (response.ok) {
                    const data = await response.json()
                    const place = data.places[0]
                    const lat = parseFloat(place.latitude)
                    const lon = parseFloat(place.longitude)
                    const cityName = place['place name']

                    // Set hidden city field
                    setValue('city', cityName)

                    // Find closest campaign city
                    let minDistance = Infinity
                    let closestCode = ''

                    CAMPAIGN_CITIES.forEach(city => {
                        const distance = getDistanceFromLatLonInKm(lat, lon, city.lat, city.lon)
                        if (distance < minDistance) {
                            minDistance = distance
                            closestCode = city.code
                        }
                    })

                    console.log(`Zip: ${val} -> Closest: ${closestCode} (${Math.round(minDistance)}km)`)
                    setValue('campaignCode', closestCode)
                }
            } catch (err) {
                console.error("Failed to lookup zip code:", err)
            }
        }
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
            const applicationId = crypto.randomUUID()
            const { error: dbError } = await supabase
                .from('applications')
                .insert({
                    id: applicationId,
                    child_name: data.childName,
                    first_name: data.firstName,
                    last_name: data.lastName,
                    email: data.email,
                    gender: data.gender,
                    city: data.city,
                    campaign_code: data.campaignCode,
                    age: parseInt(data.age),
                    phone: data.phone,
                    post_code: data.zipCode, // Mapping zipCode to existing post_code column for now
                    image_url: publicUrl,
                    status: 'new'
                })

            if (dbError) {
                console.error("Database error:", dbError)
                if (dbError.code === '23505') {
                    // Unique constraint violation code
                    throw new Error("Application already exists for this email or phone number.")
                }
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

            // 4. Send to CRM (Fire and Forget - don't block success UI)
            try {
                fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        applicationId, // Send ID for tracking
                        campaignCode: data.campaignCode,
                        email: data.email,
                        phone: data.phone,
                        city: data.city,
                        zipCode: data.zipCode,
                        childName: data.childName,
                        lastName: data.lastName,
                        image_url: publicUrl,
                        firstName: data.firstName, // Parent First Name
                        age: data.age,
                        gender: data.gender
                    })
                }).then(res => {
                    console.log("CRM Request Sent. Status:", res.status)
                }).catch(err => {
                    console.error("CRM Request Failed:", err)
                })

            } catch (crmError) {
                console.error("CRM Integration Error:", crmError)
            }

            toast.success("Application Received!", {
                description: "We will be in touch shortly."
            })

            setIsSubmitted(true)

        } catch (error: any) {
            console.error("Submission failed:", error)
            const msg = error.message || "Something went wrong. Please try again."
            toast.error(msg, {
                duration: 5000
            })
        }
    }

    const onError = (errors: FieldErrors<FormValues>) => {
        console.log("Form errors:", errors)
        toast.error("Please check the form for missing fields", {
            description: "Required fields are highlighted in red."
        })
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

            {isSubmitted ? (
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center space-y-4"
                >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
                        <ShieldCheck className="w-10 h-10 text-green-600" />
                    </div>
                    <h3 className="text-3xl font-black text-gray-900 tracking-tight">Application Received!</h3>
                    <p className="text-lg text-gray-600 max-w-sm mx-auto">
                        Thank you for applying! We have received your details safely.
                    </p>
                    <p className="text-gray-500 text-sm">
                        You can close this page now.
                    </p>
                    <Button
                        onClick={() => window.location.reload()}
                        variant="ghost"
                        className="mt-6 text-brand-blue"
                    >
                        Submit another child
                    </Button>
                </motion.div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-4">

                    {/* Child's Name & Gender */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Input
                                {...register('childName')}
                                placeholder="Child's Name"
                                icon={<User className="w-5 h-5" />}
                                className={cn("bg-white/70", errors.childName && "border-red-500 ring-red-500")}
                            />
                            {errors.childName && <p className="ml-1 text-xs font-bold text-red-500">{errors.childName.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <select
                                {...register('gender')}
                                className={cn(
                                    "flex h-12 w-full appearance-none rounded-2xl border-2 border-white/40 bg-white/70 px-4 py-2 text-base text-gray-900 shadow-sm focus-visible:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 transition-colors focus:bg-white",
                                    errors.gender && "border-red-500 ring-red-500"
                                )}
                                defaultValue=""
                            >
                                <option value="" disabled>Gender</option>
                                <option value="M">Boy</option>
                                <option value="F">Girl</option>
                            </select>
                            {errors.gender && <p className="ml-1 text-xs font-bold text-red-500">{errors.gender.message}</p>}
                        </div>
                    </div>

                    {/* Parent Name Fields Row */}
                    <label className="text-sm font-bold text-gray-700 ml-1">Parent's Details</label>
                    <div className="grid grid-cols-2 gap-3 mt-0!">
                        <div className="space-y-1">
                            <Input
                                {...register('firstName')}
                                placeholder="Parent First Name"
                                icon={<User className="w-5 h-5" />}
                                className={cn("bg-white/70", errors.firstName && "border-red-500 ring-red-500")}
                            />
                            {errors.firstName && <p className="ml-1 text-xs font-bold text-red-500">{errors.firstName.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Input
                                {...register('lastName')}
                                placeholder="Parent Last Name"
                                icon={<User className="w-5 h-5" />}
                                className={cn("bg-white/70", errors.lastName && "border-red-500 ring-red-500")}
                            />
                            {errors.lastName && <p className="ml-1 text-xs font-bold text-red-500">{errors.lastName.message}</p>}
                        </div>
                    </div>

                    {/* Email Field */}
                    <div className="space-y-1">
                        <Input
                            {...register('email')}
                            type="email"
                            placeholder="Email Address"
                            icon={<span className="font-bold text-gray-400">@</span>}
                            className={cn("bg-white/70", errors.email && "border-red-500 ring-red-500")}
                        />
                        {errors.email && <p className="ml-1 text-xs font-bold text-red-500">{errors.email.message}</p>}
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
            )}
        </motion.div>
    )
}
