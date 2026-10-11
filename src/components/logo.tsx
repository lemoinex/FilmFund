import Image from "next/image";

/**
 * Le symbole de la marque : le globe et la pellicule, en or sur fond
 * transparent. Toujours suivi du nom écrit en toutes lettres, donc sans texte
 * de remplacement : un lecteur d'écran ne le lirait que deux fois.
 */
export function LogoFilmFund({ className }: { className?: string }) {
  return (
    <Image src="/images/logo-symbole.png" alt="" width={56} height={56} className={className} />
  );
}
