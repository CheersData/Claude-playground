import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ProcessSection from "@/components/ProcessSection";
import TechnologySection from "@/components/TechnologySection";
import ServicesSection from "@/components/ServicesSection";
import ClientsSection from "@/components/ClientsSection";
import SustainabilitySection from "@/components/SustainabilitySection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <div className="luxury-divider" />
        <AboutSection />
        <ProcessSection />
        <div className="luxury-divider" />
        <TechnologySection />
        <ServicesSection />
        <div className="luxury-divider" />
        <ClientsSection />
        <SustainabilitySection />
        <div className="luxury-divider" />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}
