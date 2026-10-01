import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import { PlatformOverview } from "@/components/landing/platform-overview";
import { Pricing } from "@/components/landing/pricing";
import { ProducerSection } from "@/components/landing/producer-section";
import { ValueStrip } from "@/components/landing/value-strip";
import { VisionSection } from "@/components/landing/vision-section";

/*
 * Une publication depuis « Plans et quotas » régénère la page aussitôt. La
 * régénération toutes les cinq minutes reste un filet : elle couvre une
 * version publiée hors de l'application et le passage du mode privé, qui
 * doivent suivre sans redéploiement.
 */
export const revalidate = 300;

export default function Home() {
  return (
    <>
      <a
        href="#contenu"
        className="bg-gold text-navy sr-only rounded-full px-5 py-2.5 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-60"
      >
        Aller au contenu principal
      </a>
      <Navbar />
      <main id="contenu" className="flex-1">
        <Hero />
        <ValueStrip />
        <PlatformOverview />
        <ProducerSection />
        <VisionSection />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
