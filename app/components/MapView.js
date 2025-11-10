'use client'
import { useEffect, useRef, useState } from 'react'
import { getLeaflet } from '@/lib/leaflet'
import { useBasemapGallery } from './MapControls/useBasemapGallery'
import { useAccessibilityLegend } from './MapControls/useAccessibilityLegend'
import { useDrawHelpAlert } from './MapControls/useDrawHelpAlert'  // ✅ add this
// ✅ Leaflet icons fix — must be loaded BEFORE map init
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
});


export default function MapView() {
    const [map, setMap] = useState(null)

    useEffect(() => {
        ;(async () => {
            const L = await getLeaflet()
            const mapInstance = L.map('map', { zoomControl: false }).setView([50.4501, 30.5234], 14)
            setMap(mapInstance)
        })()
    }, [])

    // register controls
    useBasemapGallery(map)
    useAccessibilityLegend(map)
    useDrawHelpAlert(map)   // ✅ initialize new control

    return <div id="map" style={{ width: '100%', height: '100vh' }} />
}