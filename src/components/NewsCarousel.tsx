import React from "react";
import { Clock, ArrowUpRight, Cpu } from "lucide-react";

interface NewsCarouselProps {
  phone?: string;
  dynamicNews?: any[];
  fullWidth?: boolean;
}

export default function NewsCarousel({ dynamicNews }: NewsCarouselProps) {
  const list = (dynamicNews ?? []).filter((n: any) => n && n.title);

  if (!list || list.length === 0) return null;

  const item = list[0];

  return (
    <div className="-mx-4 -mt-5 mb-4">
      <div className="relative h-48 sm:h-56 bg-[var(--theme-bg)] overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--theme-text)] opacity-20">
            <Cpu className="w-10 h-10" />
          </div>
        )}
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-sm border border-white/20">
          {item.tag || "NEWS"}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1.5 bg-transparent">
        <h3 className="text-[15px] font-black leading-tight text-[var(--theme-text)] line-clamp-2">{item.title}</h3>
        <p className="text-[12px] leading-relaxed opacity-60 line-clamp-2">{item.description}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-bold opacity-40 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {item.date}
          </span>
          {item.link ? (
            <a href={item.link} target="_blank" rel="noreferrer" className="text-[11px] font-black text-[var(--theme-accent)] inline-flex items-center gap-1 hover:opacity-80">
              Read more <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
