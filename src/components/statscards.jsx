import { TrendingUp, TrendingDown } from "lucide-react";

// Mapa de colores para el icono (fondo suave + color de icono).
const colorMap = {
    blue:   { bg: "rgba(37,99,235,.12)",  fg: "#2563EB" },
    green:  { bg: "rgba(16,185,129,.12)", fg: "#10B981" },
    purple: { bg: "rgba(139,92,246,.12)", fg: "#8B5CF6" },
    orange: { bg: "rgba(245,158,11,.12)", fg: "#F59E0B" },
    red:    { bg: "rgba(239,68,68,.12)",  fg: "#EF4444" },
    slate:  { bg: "rgba(100,116,139,.14)", fg: "#64748B" },
};

export default function StatsCards({ title, value, icon, color = "blue", trend, trendLabel }) {
    const c = colorMap[color] || colorMap.blue;
    const trendNum = typeof trend === "number" ? trend : null;
    const isUp = trendNum !== null && trendNum >= 0;

    return (
        <div className="erp-card erp-card-hover w-full p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <span className="text-subtitle text-sm font-medium truncate">{title}</span>

                {icon && (
                    <div
                        className="h-11 w-11 flex items-center justify-center rounded-lg shrink-0"
                        style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                        <span className="icon">{icon}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-title text-2xl sm:text-3xl font-bold leading-tight">{value}</span>

                {trendNum !== null && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span
                            className="inline-flex items-center gap-1"
                            style={{ color: isUp ? "#10B981" : "#EF4444" }}
                        >
                            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {isUp ? "+" : ""}{trendNum}%
                        </span>
                        {trendLabel && <span className="text-subtitle font-normal">{trendLabel}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
