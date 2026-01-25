"use client"

import React from 'react'
import Image from 'next/image'

const portfolioImages = [
    "/portfolio-kid.png",
    "/portfolio-teen.png",
    "/hero-teen-lifestyle.png",
    "/profile-leo.png", // Keep some legacy for variety if needed, or remove if they look too babyish. Let's keep one.
]

export function InfinitePortfolio() {
    // Duplicate the array enough times to ensure smooth looping on large screens
    // 4 items * 300px = 1200px. We need at least 2 sets for 1080p, probably 3 sets for 4k or just safety.
    // Let's do 4 repeated sets to be safe and dense.
    const displayImages = [...portfolioImages, ...portfolioImages, ...portfolioImages, ...portfolioImages];

    return (
        <div className="relative w-full overflow-hidden bg-white/50 py-12">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#F7F5F2] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#F7F5F2] to-transparent z-10" />

            {/* w-max ensures the container grows to fit all items horizontally */}
            <div className="flex w-max animate-scroll hover:[animation-play-state:paused]">
                {displayImages.map((src, i) => (
                    <div
                        key={i}
                        className="relative h-64 w-64 flex-shrink-0 rounded-[40px] overflow-hidden border-4 border-white shadow-xl rotate-[-2deg] odd:rotate-2 mx-8"
                    >
                        <Image
                            src={src}
                            alt={`Portfolio ${i}`}
                            fill
                            className="object-cover"
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
