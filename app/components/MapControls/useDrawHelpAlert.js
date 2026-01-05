'use client'
import { useEffect } from 'react'

export function useDrawHelpAlert(map) {
    useEffect(() => {
        if (!map) return
            ;(async () => {
            const L = (await import('leaflet')).default
            const { DrawHelpAlert } = await import('@/lib/leaflet-controls/DrawHelpAlert.js')
            map.addControl(new DrawHelpAlert())
        })()
    }, [map])
}