import { useRef, useEffect, useState } from "react";

export default function Tabs({ tabs = [], activeKey, onChange, width = "100%" }) {
    const rootRef = useRef(null);
    const indicatorRef = useRef(null);

    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        const root = rootRef.current;
        const indicator = indicatorRef.current;
        if (!root || !indicator) return;

        const activeBtn = root.querySelector(`.tabBtn[data-key="${activeKey}"]`);
        if (!activeBtn) {
            indicator.style.width = '0px';
            return;
        }

        const left = activeBtn.offsetLeft;
        const widthPx = activeBtn.offsetWidth;
        indicator.style.left = `${left}px`;
        indicator.style.width = `${widthPx}px`;
    }, [activeKey, tabs]);

    const handleMouseMove = (e) => {
        if (rootRef.current) {
            const rect = rootRef.current.getBoundingClientRect();
            setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }
    };

    return (
        <div
            ref={rootRef}
            className="relative flex gap-2 p-2 mt-3 bg-secondary rounded-full items-center overflow-x-auto"
            style={{ width }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <div
                className="absolute top-0 left-0 w-full h-full rounded-full pointer-events-none transition-opacity duration-300"
                style={{
                    background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.1), transparent 80%)`,
                    opacity: isHovering ? 1 : 0,
                }}
            />

            <div
                ref={indicatorRef}
                className="absolute top-1/2 -translate-y-1/2 h-[36px] bg-tab-indicator rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all duration-300 ease-[cubic-bezier(.2,.9,.2,1)] pointer-events-none z-10"
                style={{ left: 0, width: 0 }}
            />

            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    data-key={tab.key}
                    onClick={() => onChange(tab.key)}
                    className={`tabBtn relative z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 cursor-pointer flex-shrink-0 ${activeKey === tab.key ? "text-tab-indicator" : "text-subtitle hover:text-title"
                        }`}
                >
                    {tab.icon}
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );
}