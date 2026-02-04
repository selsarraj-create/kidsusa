"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"
import { useEffect } from "react"

// Extend Window interface to include fbq
declare global {
    interface Window {
        fbq: any;
    }
}

export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1437635621416194"

export const MetaPixel = () => {
    const pathname = usePathname()

    useEffect(() => {
        // Track pageview on route change
        if (typeof window.fbq !== 'undefined') {
            window.fbq('track', 'PageView')
        }
    }, [pathname])

    return (
        <>
            <Script
                id="fb-pixel"
                strategy="afterInteractive"
                onLoad={() => {
                    // Optional: any post-load logic
                }}
                dangerouslySetInnerHTML={{
                    __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${FB_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
                }}
            />
        </>
    )
}
