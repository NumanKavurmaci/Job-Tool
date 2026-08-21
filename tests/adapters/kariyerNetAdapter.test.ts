import { describe, expect, it } from "vitest";
import { KariyerNetAdapter } from "../../src/adapters/KariyerNetAdapter.js";
import {
  kariyerAppliedFixture,
  kariyerClosedFixture,
  kariyerOpenFixture,
} from "../fixtures/kariyer.js";
import { createMockPage } from "../utils/fakePage.js";

describe("KariyerNetAdapter", () => {
  it("matches only canonical Kariyer.net job-detail URLs", () => {
    const adapter = new KariyerNetAdapter();
    expect(adapter.canHandle(kariyerOpenFixture.url)).toBe(true);
    expect(adapter.canHandle("https://kariyer.net/is-ilani/urun-yoneticisi-12345/?ref=home")).toBe(true);
    expect(adapter.canHandle("https://kurumsal.kariyer.net/is-ilani/urun-yoneticisi-12345")).toBe(false);
    expect(adapter.canHandle("https://kariyer.net.evil.example/is-ilani/urun-yoneticisi-12345")).toBe(false);
    expect(adapter.canHandle("http://www.kariyer.net/is-ilani/urun-yoneticisi-12345")).toBe(false);
    expect(adapter.canHandle("https://user:secret@www.kariyer.net/is-ilani/urun-yoneticisi-12345")).toBe(false);
    expect(adapter.canHandle("https://www.kariyer.net:444/is-ilani/urun-yoneticisi-12345")).toBe(false);
    expect(adapter.canHandle("https://www.kariyer.net/is-ilanlari")).toBe(false);
  });

  it("extracts data-test fields and preserves an open native handoff URL", async () => {
    const page = createMockPage({
      currentUrl: kariyerOpenFixture.url,
      selectors: { ...kariyerOpenFixture.selectors },
      evaluateResult: kariyerOpenFixture.structuredData,
    });
    const result = await new KariyerNetAdapter().extract(page as never, kariyerOpenFixture.url);

    expect(result).toEqual(expect.objectContaining({
      title: "Kıdemli Yazılım Mühendisi",
      company: "Acme Yazılım A.Ş.",
      location: "İstanbul (Avr.)",
      platform: "kariyer",
      applicationType: "external",
      applicationStatus: "open",
      rawWorkplaceType: "remote",
      applyUrl: kariyerOpenFixture.url,
      descriptionText: "Ölçeklenebilir ürünler geliştireceksiniz.",
      requirementsText: "TypeScript ve en az 5 yıl deneyim.",
      benefitsText: "Özel sağlık sigortası ve yemek kartı.",
    }));
    expect(result.rawText).toContain("Application Status: open");
  });

  it("uses meta and structured fallbacks and disables handoff for closed postings", async () => {
    const page = createMockPage({
      currentUrl: kariyerClosedFixture.url,
      selectors: { ...kariyerClosedFixture.selectors },
      evaluateResult: kariyerClosedFixture.structuredData,
    });
    const result = await new KariyerNetAdapter().extract(page as never, kariyerClosedFixture.url);

    expect(result).toEqual(expect.objectContaining({
      title: "Yazılım Mühendisi",
      company: "Acme Teknoloji",
      location: "Ankara, Türkiye",
      applicationType: "unknown",
      applicationStatus: "closed",
      applyUrl: null,
      rawWorkplaceType: "hybrid",
    }));
    expect(result.rawText).toContain("Application Status: closed");
  });

  it("marks a delivered Kariyer application as already applied and disables handoff", async () => {
    const page = createMockPage({
      currentUrl: kariyerAppliedFixture.url,
      selectors: { ...kariyerAppliedFixture.selectors },
      evaluateResult: kariyerAppliedFixture.structuredData,
    });

    const result = await new KariyerNetAdapter().extract(page as never, kariyerAppliedFixture.url);

    expect(result).toEqual(expect.objectContaining({
      title: "Backend Developer",
      platform: "kariyer",
      applicationStatus: "open",
      applicationType: "unknown",
      alreadyApplied: true,
      applyUrl: null,
    }));
    expect(result.rawText).toContain("Candidate Application Status: already_applied");
  });

  it("waits for a personalized applied status that hydrates after the public job shell", async () => {
    const waits: number[] = [];
    const page = createMockPage({
      currentUrl: kariyerAppliedFixture.url,
      selectors: { ...kariyerOpenFixture.selectors },
      evaluateResult: kariyerAppliedFixture.structuredData,
      onWaitForTimeout(timeoutMs, context) {
        waits.push(timeoutMs);
        if (timeoutMs < 1_000) {
          context.setState({
            selectors: {
              ...kariyerOpenFixture.selectors,
              "[data-test='application-status-list']": {
                text: "Bu ilana başvurdunuz\n13.08.2026",
              },
              "[data-test='application-status-item']": {
                text: "Bu ilana başvurdunuz\n13.08.2026",
              },
              "[data-test='interaction-label']": { text: "Bu ilana başvurdunuz" },
            },
          });
        }
      },
    });

    const result = await new KariyerNetAdapter().extract(page as never, kariyerAppliedFixture.url);

    expect(waits).toContain(400);
    expect(result).toMatchObject({
      alreadyApplied: true,
      applicationType: "unknown",
      applyUrl: null,
    });
  });

  it("accepts a visible status history with a CV detail link as strong applied evidence", async () => {
    const page = createMockPage({
      currentUrl: kariyerAppliedFixture.url,
      selectors: {
        ...kariyerOpenFixture.selectors,
        "[data-test='application-status-list']": { text: "Başvuru Bilgileri\n13.08.2026" },
        "[data-test='application-status-item']": { text: "13.08.2026" },
        "[data-test='cv-detail-link']": { text: "CV detayını incele" },
      },
      evaluateResult: kariyerAppliedFixture.structuredData,
    });

    const result = await new KariyerNetAdapter().extract(page as never, kariyerAppliedFixture.url);

    expect(result.alreadyApplied).toBe(true);
    expect(result.applyUrl).toBeNull();
  });

  it("ignores hidden applied templates and stops polling after a bounded number of attempts", async () => {
    const waits: number[] = [];
    const page = createMockPage({
      currentUrl: kariyerOpenFixture.url,
      selectors: {
        ...kariyerOpenFixture.selectors,
        "[data-test='application-status-list']": {
          text: "Başvurunuz gönderildi",
          visible: false,
        },
        "[data-test='application-status-item']": {
          text: "Başvurunuz gönderildi",
          visible: false,
        },
        "[data-test='interaction-label']": {
          text: "Başvurunuz gönderildi",
          visible: false,
        },
        "[data-test='cv-detail-link']": { text: "CV detayını incele", visible: false },
      },
      evaluateResult: kariyerOpenFixture.structuredData,
      onWaitForTimeout(timeoutMs) {
        waits.push(timeoutMs);
      },
    });

    const result = await new KariyerNetAdapter().extract(page as never, kariyerOpenFixture.url);

    expect(waits.filter((timeoutMs) => timeoutMs === 400)).toHaveLength(5);
    expect(result.alreadyApplied).toBeUndefined();
    expect(result.applicationType).toBe("external");
    expect(result.applyUrl).toBe(kariyerOpenFixture.url);
  });

  it("parses the current visible Kariyer description and location selectors without JSON-LD", async () => {
    const page = createMockPage({
      currentUrl: kariyerOpenFixture.url,
      evaluateResult: null,
      selectors: {
        "[data-test='job-title']": { text: "BPM Yazılım Mühendisi" },
        "[data-test='company-name']": { text: "Konica Minolta Turkey" },
        "[data-test='company-location']": { text: "Ankara" },
        "[data-test='job-feature-item']": { text: "İş Yerinde" },
        "[data-test='qualifications-and-job-description']": {
          text: "İş Tanımı:\nSüreç uygulamaları geliştirin.\nNitelikler:\nTypeScript ve 2 yıl deneyim.",
        },
        body: { text: "Aday Kriterleri Tecrübe 1-2 yıl" },
      },
    });

    const result = await new KariyerNetAdapter().extract(page as never, kariyerOpenFixture.url);

    expect(result).toMatchObject({
      title: "BPM Yazılım Mühendisi",
      company: "Konica Minolta Turkey",
      location: "Ankara",
      rawWorkplaceType: "onsite",
      descriptionText: "Süreç uygulamaları geliştirin.",
      requirementsText: "TypeScript ve 2 yıl deneyim.",
    });
  });

  it("refuses extraction for spoofed URLs before navigation", async () => {
    const page = createMockPage();
    await expect(
      new KariyerNetAdapter().extract(page as never, "https://kariyer.net.evil.example/is-ilani/rol-123"),
    ).rejects.toThrow(/canonical kariyer\.net/i);
  });
});
