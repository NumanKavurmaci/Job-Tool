export const kariyerOpenFixture = {
  url: "https://www.kariyer.net/is-ilani/acme-yazilim-kidemli-yazilim-muhendisi-4512345",
  structuredData: {
    title: "Kıdemli Yazılım Mühendisi",
    company: "Acme Yazılım A.Ş.",
    companyLogoUrl: "https://cdn.example.com/acme-logo.png",
    location: "İstanbul, Türkiye",
    workplaceType: "TELECOMMUTE",
    descriptionText: "Ölçeklenebilir ürünler geliştireceksiniz.",
    requirementsText: "TypeScript ve en az 5 yıl deneyim.",
    benefitsText: "Özel sağlık sigortası ve yemek kartı.",
    applyUrl: "https://www.kariyer.net/is-ilani/acme-yazilim-kidemli-yazilim-muhendisi-4512345",
    expired: false,
  },
  selectors: {
    "[data-test='job-title']": { text: "Kıdemli Yazılım Mühendisi" },
    "[data-test='company-name']": { text: "Acme Yazılım A.Ş." },
    "[data-test='company-location']": { text: "İstanbul (Avr.)" },
    "[data-test='job-feature-item']": { text: "Uzaktan Çalışma" },
    "[data-test='qualifications-and-job-description']": {
      text: "İş Tanımı: Ölçeklenebilir ürünler geliştireceksiniz.\nNitelikler: TypeScript ve en az 5 yıl deneyim.",
    },
    "[data-test='candidate-criteria']": { text: "TypeScript ve en az 5 yıl deneyim." },
    "[data-test='job-features']": { text: "Özel sağlık sigortası ve yemek kartı." },
    "a[data-test='apply-button']": { attributes: { href: "/is-ilani/acme-yazilim-kidemli-yazilim-muhendisi-4512345" } },
    body: { text: "Kıdemli Yazılım Mühendisi\nİş Tanımı\nÖlçeklenebilir ürünler geliştireceksiniz.\nNitelikler\nTypeScript" },
  },
} as const;

export const kariyerAppliedFixture = {
  url: "https://www.kariyer.net/is-ilani/acme-yazilim-backend-developer-4599999",
  structuredData: {
    ...kariyerOpenFixture.structuredData,
    title: "Backend Developer",
    applyUrl: "https://www.kariyer.net/is-ilani/acme-yazilim-backend-developer-4599999",
  },
  selectors: {
    ...kariyerOpenFixture.selectors,
    "[data-test='job-title']": { text: "Backend Developer" },
    "[data-test='application-info-title']": { text: "Başvuru Bilgileri" },
    "[data-test='application-status-list']": { text: "Başvurun İletildi\n13.08.2026" },
    "[data-test='application-status-item']": { text: "Başvurun İletildi\n13.08.2026" },
    "[data-test='interaction-label']": { text: "Başvurun İletildi" },
    "[data-test='status-date']": { text: "13.08.2026" },
    "[data-test='cv-detail-link']": { text: "CV detayını incele" },
    body: {
      text: "Backend Developer\nBaşvuru Bilgileri\nBaşvurun İletildi\n13.08.2026",
    },
  },
} as const;

export const kariyerClosedFixture = {
  url: "https://www.kariyer.net/is-ilani/acme-eski-yazilim-muhendisi-4474327",
  structuredData: {
    title: "Yazılım Mühendisi",
    company: "Acme Teknoloji",
    companyLogoUrl: null,
    location: "Ankara, Türkiye",
    workplaceType: "Hibrit",
    descriptionText: "Platform servislerini geliştirin.",
    requirementsText: "3 yıl deneyim.",
    benefitsText: null,
    applyUrl: null,
    expired: true,
  },
  selectors: {
    "meta[property='og:title']": { attributes: { content: "Yazılım Mühendisi" } },
    "meta[property='og:site_name']": { attributes: { content: "Acme Teknoloji" } },
    body: { text: "Bu ilan başvuruları artık kabul etmiyor." },
  },
} as const;
