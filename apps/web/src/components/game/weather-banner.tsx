"use client";

import React, { useMemo } from "react";
import { Cloud, Zap, Droplets, Sun } from "lucide-react";

interface WeatherBannerProps {
    weather: {
        type: string;
        turnsRemaining: number;
    };
}

export const WeatherBanner = ({ weather }: WeatherBannerProps) => {
    const config = useMemo(() => {
        switch (weather.type) {
            case "dust_storm":
                return {
                    icon: <Cloud className="w-5 h-5 text-amber-200" />,
                    title: "Dust Storm",
                    desc: "Visibility Reduced (-1 Vision)",
                    bg: "bg-amber-900/40 border-amber-700/50",
                    text: "text-amber-100",
                };
            case "solar_flare":
                return {
                    icon: <Sun className="w-5 h-5 text-orange-400 animate-pulse" />,
                    title: "Solar Flare",
                    desc: "High Radiation (+50% Flux, Air Grounded)",
                    bg: "bg-orange-900/40 border-orange-700/50",
                    text: "text-orange-100",
                };
            case "acid_rain":
                return {
                    icon: <Droplets className="w-5 h-5 text-green-400" />,
                    title: "Acid Rain",
                    desc: "Corrosive Atmosphere (-2 HP/turn)",
                    bg: "bg-green-900/40 border-green-700/50",
                    text: "text-green-100",
                };
            case "clear_skies":
                return {
                    icon: <Sun className="w-5 h-5 text-sky-200" />,
                    title: "Clear Skies",
                    desc: "Optimal Conditions (+1 Vision)",
                    bg: "bg-sky-900/40 border-sky-700/50",
                    text: "text-sky-100",
                };
            default:
                return null;
        }
    }, [weather.type]);

    if (!config) return null;

    return (
        <div className={`
      absolute top-20 left-1/2 -translate-x-1/2 z-30
      flex items-center gap-3 px-4 py-2 rounded-full
      backdrop-blur-sm border shadow-lg
      animate-in fade-in slide-in-from-top-4 duration-500
      ${config.bg} ${config.text}
    `}>
            {config.icon}
            <div className="flex flex-col leading-none">
                <span className="font-bold text-sm flex items-center gap-2">
                    {config.title}
                    <span className="text-[10px] opacity-70 font-mono border border-current px-1 rounded">
                        {weather.turnsRemaining}T
                    </span>
                </span>
                <span className="text-[10px] opacity-80 mt-0.5">{config.desc}</span>
            </div>
        </div>
    );
};
