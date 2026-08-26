import {
  Trees,
  HeartHandshake,
  Building2,
  Palette,
  MessageCircle,
  Users,
  CalendarCheck,
  WandSparkles,
  ShieldCheck,
  Quote,
  ArrowRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

export type TimelineSlideType =
  | "services"
  | "process"
  | "testimonials"
  | "faq"
  | "cta";

const STATS = [
  { value: "120", label: "Acres of Estate" },
  { value: "500+", label: "Celebrations Hosted" },
  { value: "20", label: "Years of Craft" },
  { value: "40", label: "Countries Represented" },
];

const SERVICES: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Trees,
    title: "The Estate",
    description:
      "Heritage halls, lakeside lawns and 120 acres of manicured grounds.",
  },
  {
    icon: HeartHandshake,
    title: "Weddings & Celebrations",
    description:
      "From intimate garden ceremonies to multi-day destination celebrations.",
  },
  {
    icon: Building2,
    title: "Corporate & Social",
    description:
      "Launches, galas and conferences, delivered with the same precision.",
  },
  {
    icon: Palette,
    title: "Décor, Dining & Design",
    description:
      "In-house floral, styling and culinary teams who build your vision.",
  },
];

const STEPS: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: MessageCircle,
    title: "Consultation",
    description: "A conversation about your vision, dates and guest list.",
  },
  {
    icon: Users,
    title: "Communication",
    description: "One dedicated coordinator, one line of contact.",
  },
  {
    icon: CalendarCheck,
    title: "Planning",
    description: "Venues, vendors, timelines — choreographed to the minute.",
  },
  {
    icon: WandSparkles,
    title: "Personalization",
    description: "Every detail tailored, from palette to final dance.",
  },
  {
    icon: ShieldCheck,
    title: "Quality Assurance",
    description: "Rehearsals and oversight until the last guest leaves.",
  },
];

const PRESS = [
  "Vogue Weddings",
  "Harper's Bazaar",
  "Brides",
  "Martha Stewart Weddings",
];

const TESTIMONIALS = [
  {
    quote:
      "Alphamax turned our two-day celebration into something out of a film.",
    name: "Ananya & Rohan",
    detail: "Wedding · 480 guests",
  },
  {
    quote:
      "Our annual gala ran with a precision we have never seen from a venue team.",
    name: "Priya Menon",
    detail: "VP Marketing, Meridian Tech",
  },
  {
    quote:
      "From first consultation to final farewell — one team, one vision.",
    name: "James & Sarah Whitfield",
    detail: "Destination Wedding",
  },
];

const FAQS = [
  {
    question: "How far in advance should we book?",
    answer:
      "We recommend 9–12 months for weekend dates, and up to 18 months for peak-season Saturdays.",
  },
  {
    question: "What is the maximum event size?",
    answer:
      "The estate hosts from 50 to 1,500 guests — intimate ceremonies to multi-day celebrations.",
  },
  {
    question: "What does the venue provide?",
    answer:
      "In-house teams cover décor, floral, lighting, dining and coordination; external vendors are welcome.",
  },
  {
    question: "Do you offer planning, or just the venue?",
    answer:
      "Both — choose venue-only, full planning, or anything in between.",
  },
  {
    question: "What is the pricing range?",
    answer:
      "Packages are tailored to season, scale and scope; we share a range after a short conversation.",
  },
  {
    question: "What happens after I inquire?",
    answer:
      "A coordinator responds within 24 hours with availability and next steps.",
  },
];

const eyebrowClass =
  "mb-3 text-[11px] font-light uppercase tracking-[0.3em] text-white/70 sm:mb-4 sm:text-xs";

const cardClass =
  "border border-white/10 bg-neutral-950/50";

const cardDesktopClass =
  "border border-white/10 bg-neutral-950/50 backdrop-blur-sm";

function Headline({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-8 text-center sm:mb-10">
      <p className={eyebrowClass}>{eyebrow}</p>
      <h3 className="text-2xl font-light tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
        {title}
      </h3>
    </div>
  );
}

export function ServicesSlide({ isMobile }: { isMobile?: boolean }) {
  const card = isMobile ? cardClass : cardDesktopClass;
  return (
    <div className="mx-auto max-w-5xl">
      <Headline eyebrow="What We Offer" title="One Estate, Every Detail" />
      <div className="mx-auto mb-8 grid max-w-3xl grid-cols-2 gap-y-4 border-y border-white/10 py-4 sm:gap-y-6 sm:py-6 md:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-2xl font-light tracking-tight text-white sm:text-3xl">
              {stat.value}
            </p>
            <p className="mt-1 text-[10px] font-light uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <div key={service.title} className={`flex gap-4 p-4 sm:p-6 ${card}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 text-amber-400/90 sm:h-11 sm:w-11">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h4 className="mb-1.5 text-base font-light tracking-tight text-white sm:text-lg">
                  {service.title}
                </h4>
                <p className="text-xs font-light leading-relaxed text-neutral-300 sm:text-sm">
                  {service.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProcessSlide() {
  return (
    <div className="mx-auto max-w-5xl">
      <Headline eyebrow="Our Process" title="From First Call to Final Farewell" />
      <div className="grid gap-6 sm:gap-8 md:grid-cols-5 md:gap-4">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className="relative flex gap-4 sm:gap-5 md:block md:text-center"
            >
              {i < STEPS.length - 1 && (
                <div
                  className="absolute left-5 top-12 h-[calc(100%+0.5rem)] w-px bg-white/10 sm:left-[22px] md:left-auto md:right-0 md:top-6 md:h-px md:w-full"
                  aria-hidden="true"
                />
              )}
              <div className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 text-amber-400/90 sm:h-11 sm:w-11 md:mx-auto md:mb-4">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-light uppercase tracking-[0.3em] text-neutral-400 sm:text-[11px]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h4 className="mb-1.5 text-base font-light tracking-tight text-white sm:text-lg">
                  {step.title}
                </h4>
                <p className="text-xs font-light leading-relaxed text-neutral-300">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TestimonialsSlide({ isMobile }: { isMobile?: boolean }) {
  const card = isMobile ? cardClass : cardDesktopClass;
  return (
    <div className="mx-auto max-w-5xl">
      <Headline eyebrow="Kind Words" title="Stories Our Guests Tell" />
      <div className="mx-auto mb-8 max-w-3xl border-y border-white/10 py-4 text-center sm:mb-10 sm:py-5">
        <p className="mb-3 text-[10px] font-light uppercase tracking-[0.3em] text-neutral-400 sm:text-[11px]">
          As Featured In
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-8 sm:gap-y-3">
          {PRESS.map((name) => (
            <span
              key={name}
              className="text-[10px] font-light uppercase tracking-[0.2em] text-white/40 sm:text-xs"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className={`${card} flex flex-col p-5 sm:p-6`}>
            <Quote className="mb-4 h-4 w-4 text-amber-400/70" aria-hidden="true" />
            <blockquote className="flex-1 text-xs font-light leading-relaxed text-neutral-200 sm:text-sm">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-5 sm:mt-6">
              <p className="text-sm font-light tracking-wide text-white">
                {t.name}
              </p>
              <p className="mt-1 text-[10px] font-light uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                {t.detail}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function FaqSlide({ isMobile }: { isMobile?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Headline eyebrow="Questions, Answered" title="Before You Ask" />
      <div>
        {FAQS.map((faq) => (
          <details
            key={faq.question}
            className={`group border-b border-white/10 bg-neutral-950/40${isMobile ? "" : " backdrop-blur-sm"}`}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-left sm:gap-6 sm:px-5 sm:py-4">
              <span className="text-sm font-light tracking-wide text-white transition-colors duration-300 group-hover:text-amber-300/90">
                {faq.question}
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-300 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="px-4 pb-4 text-xs font-light leading-relaxed text-neutral-300 sm:px-5 sm:pb-5 sm:text-sm">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

export function CtaSlide() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={eyebrowClass}>Limited Peak-Season Dates Remain</p>
      <h3 className="mb-5 text-2xl font-light tracking-tight text-white sm:mb-6 sm:text-3xl md:text-4xl lg:text-5xl">
        The Date Is Yours to Imagine
      </h3>
      <p className="mb-8 text-sm font-light text-neutral-200 sm:mb-10 sm:text-lg">
        Tell us about the day you have in mind — we will show you the
        possibilities.
      </p>
      <a
        href="#contact"
        className="group inline-flex items-center gap-3 bg-white px-8 py-4 text-xs font-medium uppercase tracking-[0.3em] text-neutral-950 transition-colors duration-300 hover:bg-white/85 sm:px-10"
      >
        Enquire Now
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </a>
    </div>
  );
}

export function TimelineSlideContent({ type, isMobile }: { type: TimelineSlideType; isMobile?: boolean }) {
  switch (type) {
    case "services":
      return <ServicesSlide isMobile={isMobile} />;
    case "process":
      return <ProcessSlide />;
    case "testimonials":
      return <TestimonialsSlide isMobile={isMobile} />;
    case "faq":
      return <FaqSlide isMobile={isMobile} />;
    case "cta":
      return <CtaSlide />;
  }
}
