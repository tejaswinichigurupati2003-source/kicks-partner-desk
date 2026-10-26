import { DEFAULT_ASSUMPTIONS, chainWeeks, type Assumptions } from "./config";
import type { Application, Decision, Language, Offer } from "./types";

export type AskKind = "pin" | "pinCity" | "space" | "size" | "investment" | "experience";
export type RuleKind = "store" | "money" | "duplicate" | "area" | "lowfit";

export function askKind(ask: string | undefined): AskKind {
  if (!ask) return "pin";
  if (/pin code and city/i.test(ask)) return "pinCity";
  if (/confirm the pin/i.test(ask)) return "pin";
  if (/shop space/i.test(ask)) return "space";
  if (/size of the space/i.test(ask)) return "size";
  if (/invest/i.test(ask)) return "investment";
  return "experience";
}

export function ruleKind(d: Decision): RuleKind {
  if (d.duplicateOf) return "duplicate";
  if (/overall fit too low/i.test(d.verdict)) return "lowfit";
  if (/already have a store/i.test(d.verdict)) return "store";
  if (/below the/i.test(d.verdict)) return "money";
  return "area";
}

const ASK_TEXT: Record<Language, Record<AskKind, string>> = {
  English: {
    pin: "please confirm your 6-digit pin code",
    pinCity: "your pin code and city don't match. Please tell us which one is correct",
    space: "please tell us if you already have a shop space: owned, rented, or not yet found",
    size: "please tell us the size of your shop space in sq ft",
    investment: "please tell us how much you can invest, in ₹ lakh",
    experience: "please tell us how many years you have run or managed a shop (0 if none)",
  },
  Kannada: {
    pin: "ದಯವಿಟ್ಟು ನಿಮ್ಮ 6 ಅಂಕಿಯ ಪಿನ್ ಕೋಡ್ ಖಚಿತಪಡಿಸಿ",
    pinCity: "ನಿಮ್ಮ ಪಿನ್ ಕೋಡ್ ಮತ್ತು ನಗರ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ. ಯಾವುದು ಸರಿ ಎಂದು ತಿಳಿಸಿ",
    space: "ನಿಮ್ಮ ಬಳಿ ಈಗಾಗಲೇ ಅಂಗಡಿ ಜಾಗ ಇದೆಯೇ ಎಂದು ತಿಳಿಸಿ: ಸ್ವಂತದ್ದು, ಬಾಡಿಗೆಯದು, ಅಥವಾ ಇನ್ನೂ ಸಿಕ್ಕಿಲ್ಲ",
    size: "ನಿಮ್ಮ ಅಂಗಡಿ ಜಾಗದ ಅಳತೆಯನ್ನು ಚದರ ಅಡಿಗಳಲ್ಲಿ ತಿಳಿಸಿ",
    investment: "ನೀವು ಎಷ್ಟು ಹೂಡಿಕೆ ಮಾಡಬಹುದು ಎಂಬುದನ್ನು ₹ ಲಕ್ಷಗಳಲ್ಲಿ ತಿಳಿಸಿ",
    experience: "ನೀವು ಎಷ್ಟು ವರ್ಷ ಅಂಗಡಿ ನಡೆಸಿದ್ದೀರಿ ಅಥವಾ ನೋಡಿಕೊಂಡಿದ್ದೀರಿ ಎಂದು ತಿಳಿಸಿ (ಇಲ್ಲದಿದ್ದರೆ 0)",
  },
  Hindi: {
    pin: "कृपया अपना 6 अंकों का पिन कोड बताइए",
    pinCity: "आपका पिन कोड और शहर मेल नहीं खा रहे हैं। कृपया बताइए कि कौन सा सही है",
    space: "कृपया बताइए कि क्या आपके पास पहले से दुकान की जगह है: अपनी, किराये की, या अभी नहीं मिली",
    size: "कृपया अपनी दुकान की जगह का आकार वर्ग फीट में बताइए",
    investment: "कृपया बताइए कि आप कितना निवेश कर सकते हैं, ₹ लाख में",
    experience: "कृपया बताइए कि आपने कितने साल दुकान चलाई या संभाली है (नहीं तो 0)",
  },
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

const RULE_TEXT: Record<Language, Record<RuleKind, (a: Application, d: Decision, asm: Assumptions) => string>> = {
  English: {
    store: (a) => `we already have a Kicks store in pin code ${a.pin}, and we open only one store per pin code. We can look at another pin code nearby`,
    money: (_a, d, asm) => `your investment is more than ${asm.investmentTolerancePct}% below the ₹${num(((d.setupCost ?? 0) * asm.minInvestmentPctOfSetup) / 100)} lakh we need for this city. If you can raise it, please apply again`,
    duplicate: () => "we already have another application from you for the same pin code, and we are using that one",
    area: (a) => `we are not opening stores in pin code ${a.pin} right now. We will contact you when that changes`,
    lowfit: () => "the overall fit of the application is below what we need right now. A shop space and more retail experience would help most. Please apply again when these change",
  },
  Kannada: {
    store: (a) => `ಪಿನ್ ಕೋಡ್ ${a.pin}ನಲ್ಲಿ ನಮ್ಮ ಕಿಕ್ಸ್ ಸ್ಟೋರ್ ಈಗಾಗಲೇ ಇದೆ, ಮತ್ತು ನಾವು ಒಂದು ಪಿನ್ ಕೋಡ್‌ನಲ್ಲಿ ಒಂದೇ ಸ್ಟೋರ್ ತೆರೆಯುತ್ತೇವೆ. ಹತ್ತಿರದ ಬೇರೆ ಪಿನ್ ಕೋಡ್ ನೋಡಬಹುದು`,
    money: (_a, d, asm) => `ಈ ನಗರಕ್ಕೆ ನಮಗೆ ಬೇಕಾದ ₹${num(((d.setupCost ?? 0) * asm.minInvestmentPctOfSetup) / 100)} ಲಕ್ಷಕ್ಕಿಂತ ನಿಮ್ಮ ಹೂಡಿಕೆ ${asm.investmentTolerancePct}%ಕ್ಕಿಂತ ಹೆಚ್ಚು ಕಡಿಮೆ ಇದೆ. ಮೊತ್ತ ಹೊಂದಿಸಲು ಸಾಧ್ಯವಾದರೆ ದಯವಿಟ್ಟು ಮತ್ತೆ ಅರ್ಜಿ ಹಾಕಿ`,
    duplicate: () => "ಅದೇ ಪಿನ್ ಕೋಡ್‌ಗೆ ನಿಮ್ಮ ಇನ್ನೊಂದು ಅರ್ಜಿ ನಮ್ಮ ಬಳಿ ಇದೆ, ಅದನ್ನೇ ನಾವು ಪರಿಗಣಿಸುತ್ತಿದ್ದೇವೆ",
    area: (a) => `ಸದ್ಯಕ್ಕೆ ಪಿನ್ ಕೋಡ್ ${a.pin}ನಲ್ಲಿ ನಾವು ಸ್ಟೋರ್ ತೆರೆಯುತ್ತಿಲ್ಲ. ಅದು ಬದಲಾದಾಗ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ`,
    lowfit: () => "ಅರ್ಜಿಯ ಒಟ್ಟಾರೆ ಹೊಂದಾಣಿಕೆ ಸದ್ಯಕ್ಕೆ ನಮಗೆ ಬೇಕಾದ ಮಟ್ಟಕ್ಕಿಂತ ಕಡಿಮೆ ಇದೆ. ಅಂಗಡಿ ಜಾಗ ಮತ್ತು ಹೆಚ್ಚಿನ ಚಿಲ್ಲರೆ ಅನುಭವ ಹೆಚ್ಚು ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಇವು ಬದಲಾದಾಗ ಮತ್ತೆ ಅರ್ಜಿ ಹಾಕಿ",
  },
  Hindi: {
    store: (a) => `पिन कोड ${a.pin} में हमारा Kicks स्टोर पहले से है, और हम एक पिन कोड में केवल एक स्टोर खोलते हैं। हम पास का कोई दूसरा पिन कोड देख सकते हैं`,
    money: (_a, d, asm) => `आपका निवेश इस शहर के लिए ज़रूरी ₹${num(((d.setupCost ?? 0) * asm.minInvestmentPctOfSetup) / 100)} लाख से ${asm.investmentTolerancePct}% से ज़्यादा कम है। अगर आप रकम जुटा सकें तो कृपया दोबारा आवेदन करें`,
    duplicate: () => "उसी पिन कोड के लिए आपका एक और आवेदन हमारे पास है, और हम उसी को देख रहे हैं",
    area: (a) => `अभी हम पिन कोड ${a.pin} में स्टोर नहीं खोल रहे हैं। स्थिति बदलने पर हम आपसे संपर्क करेंगे`,
    lowfit: () => "आवेदन की कुल मज़बूती अभी हमारी ज़रूरत से कम है। दुकान की जगह और ज़्यादा रिटेल अनुभव सबसे ज़्यादा मदद करेंगे। ये बदलने पर कृपया दोबारा आवेदन करें",
  },
};

function offerText(lang: Language, offers: Offer[]): string {
  const bits = offers.slice(0, 2).map((o) => `${o.city} (${o.pins.slice(0, 3).join(", ")})`);
  if (!bits.length) return "";
  const list = bits.join("; ");
  if (lang === "Kannada") return `ಬೇರೆ ಆಯ್ಕೆಗಳಿವೆ: ${list}. ಒಪ್ಪಿಕೊಳ್ಳಲು ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ.`;
  if (lang === "Hindi") return `दूसरे विकल्प भी हैं: ${list}। स्वीकार करने के लिए इस संदेश का जवाब दें।`;
  return `Other options: ${list}. Reply to this message to accept one.`;
}

export interface MessageFacts {
  now: Date;
  link: string;
  assumptions?: Assumptions;
}

export function deadlineText(now: Date, days = DEFAULT_ASSUMPTIONS.conditionDays): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function conditionLine(d: Decision, lang: Language): string {
  return d.condition
    .map((c) => {
      const amount = c.text.match(/₹([\d.]+) lakh/)?.[1] ?? "";
      if (lang === "Kannada") {
        if (c.kind === "space") return "ಅಂಗಡಿ ಜಾಗ ಹುಡುಕಿ ವಿವರ ಕಳುಹಿಸಿ";
        if (c.kind === "floor") return "ಮೇಲಿನ ಮಹಡಿಯ ಅಂಗಡಿಗೆ ಗ್ರಾಹಕರನ್ನು ಹೇಗೆ ಕರೆತರುತ್ತೀರಿ ಎಂದು ತಿಳಿಸಿ, ಅಥವಾ ನೆಲ ಮಹಡಿಯ ಆಯ್ಕೆ ಕಳುಹಿಸಿ";
        return `ಹೆಚ್ಚುವರಿ ₹${amount} ಲಕ್ಷದ (ಸಾಲ ಅಥವಾ ಸ್ವಂತ ಹಣ) ಪುರಾವೆ ತೋರಿಸಿ`;
      }
      if (lang === "Hindi") {
        if (c.kind === "space") return "दुकान की जगह ढूँढकर उसकी जानकारी भेजें";
        if (c.kind === "floor") return "ऊपरी मंज़िल की दुकान पर ग्राहक कैसे लाएँगे यह बताएँ, या ग्राउंड फ्लोर का विकल्प भेजें";
        return `अतिरिक्त ₹${amount} लाख (लोन या अपना पैसा) का प्रमाण दिखाएँ`;
      }
      return c.text.replace(/ within \d+ days\.?$/, "");
    })
    .join("; ");
}

/** Standard message in the applicant's language. Greets by name, no scores, no other applicants. */
export function buildMessage(a: Application, d: Decision, lang: Language, facts: MessageFacts): string {
  const { link, now } = facts;
  const asm = facts.assumptions ?? DEFAULT_ASSUMPTIONS;
  const name = a.name || (lang === "English" ? "there" : "");
  const pin = a.pin;
  const city = a.city;
  const open = Math.round(chainWeeks(asm, false));
  const days = asm.conditionDays;

  switch (d.status) {
    case "approved": {
      if (lang === "Kannada")
        return `ನಮಸ್ಕಾರ ${name}, ಶುಭ ಸುದ್ದಿ! ${city}ದ ಪಿನ್ ಕೋಡ್ ${pin}ನಲ್ಲಿ ಕಿಕ್ಸ್ ಸ್ಟೋರ್ ತೆರೆಯಲು ನಿಮಗೆ ಅವಕಾಶ ಸಿಕ್ಕಿದೆ.\nಮೊದಲ ಮೂರು ಕೆಲಸಗಳು: 1) ಗುರುತು ಮತ್ತು ವಿಳಾಸದ ದಾಖಲೆ ಕಳುಹಿಸಿ, 2) ಅಂಗಡಿ ಭೇಟಿಗೆ ಜಾಗ ಸಿದ್ಧವಾಗಿಡಿ, 3) ಬ್ಯಾಂಕ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಸಿದ್ಧವಾಗಿಡಿ.\nನಮ್ಮ ವಿಸ್ತರಣಾ ತಂಡ 2 ಕೆಲಸದ ದಿನಗಳಲ್ಲಿ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತದೆ. ಸುಮಾರು ${open} ವಾರಗಳಲ್ಲಿ ಸ್ಟೋರ್ ತೆರೆಯುವ ನಿರೀಕ್ಷೆ ಇದೆ.\nಪ್ರಗತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi")
        return `नमस्ते ${name}, खुशखबरी! ${city} के पिन कोड ${pin} में Kicks स्टोर खोलने के लिए आपको मौका मिला है।\nपहले तीन काम: 1) पहचान और पते का प्रमाण भेजें, 2) दुकान की जगह साइट विज़िट के लिए तैयार रखें, 3) बैंक स्टेटमेंट तैयार रखें।\nहमारी विस्तार टीम 2 कार्यदिवस में आपको फोन करेगी। स्टोर लगभग ${open} हफ्तों में खुलने की उम्मीद है।\nप्रगति देखें: ${link}`;
      return `Hi ${name}, good news! Kicks has an opening for you at pin code ${pin} in ${city}.\nYour first three steps: 1) send your ID and address proof, 2) keep the shop ready for a site visit, 3) keep your bank statements ready.\nOur expansion team will call you within 2 working days. We expect your store to open in about ${open} weeks.\nTrack your progress: ${link}`;
    }
    case "conditional": {
      const date = deadlineText(now, days);
      const line = conditionLine(d, lang);
      if (lang === "Kannada")
        return `ನಮಸ್ಕಾರ ${name}, ಶುಭ ಸುದ್ದಿ! ${city}ದ ಪಿನ್ ಕೋಡ್ ${pin}ನಲ್ಲಿ ನಿಮಗೆ ಒಂದು ಅವಕಾಶವನ್ನು ಕಾಯ್ದಿರಿಸಿದ್ದೇವೆ.\nಒಂದು ಷರತ್ತು ಇದೆ: ${line}. ${date}ರ ಒಳಗೆ ಇದನ್ನು ಮಾಡಬೇಕು.\nಅಷ್ಟರೊಳಗೆ ಆಗದಿದ್ದರೆ ಅವಕಾಶವನ್ನು ಮುಂದಿನ ಅರ್ಜಿದಾರರಿಗೆ ನೀಡಲಾಗುತ್ತದೆ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi")
        return `नमस्ते ${name}, खुशखबरी! ${city} के पिन कोड ${pin} में हमने आपके लिए एक स्टोर का मौका रोककर रखा है।\nएक शर्त है: ${line}। यह ${date} तक करना होगा।\nतब तक न हो पाया तो यह मौका अगले आवेदक को दे दिया जाएगा।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, good news! We are holding an opening for you at pin code ${pin} in ${city}.\nOne condition: ${line}. Please do this by ${date}.\nIf it isn't done by then, the opening goes to the next applicant.\nCheck your status: ${link}`;
    }
    case "redirected": {
      const np = d.redirectPin ?? "";
      const storeAndSpace = d.reasonTrail.some((t) => t.check === "Existing store" && t.result === "fail") && d.hasSpace;
      const needsSpace = !d.hasSpace;
      if (lang === "Kannada") {
        const note = storeAndSpace ? `ಪಿನ್ ಕೋಡ್ ${pin}ನಲ್ಲಿ ನಮ್ಮ ಸ್ಟೋರ್ ಈಗಾಗಲೇ ಇರುವುದರಿಂದ ನಿಮ್ಮ ಜಾಗ ಬಳಸಲಾಗುವುದಿಲ್ಲ; ಪಿನ್ ಕೋಡ್ ${np}ನಲ್ಲಿ ನಿಮಗೆ ಹೊಸ ಜಾಗ ಬೇಕಾಗುತ್ತದೆ.` : needsSpace ? `ಅಲ್ಲಿ ${days} ದಿನಗಳೊಳಗೆ ಜಾಗ ಹುಡುಕಿ ಕಳುಹಿಸಬೇಕು.` : "";
        return `ನಮಸ್ಕಾರ ${name}, ಅರ್ಜಿ ಹಾಕಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಪಿನ್ ಕೋಡ್ ${pin} ಲಭ್ಯವಿಲ್ಲ, ಆದರೆ ${city}ದ ಪಿನ್ ಕೋಡ್ ${np} ಅನ್ನು ನಿಮಗೆ ನೀಡಬಹುದು. ${note}\nಒಪ್ಪಿಕೊಳ್ಳಲು ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      }
      if (lang === "Hindi") {
        const note = storeAndSpace ? `पिन कोड ${pin} में हमारा स्टोर पहले से है, इसलिए आपकी जगह इस्तेमाल नहीं हो सकती; पिन कोड ${np} में आपको नई जगह चाहिए होगी।` : needsSpace ? `वहाँ ${days} दिन में जगह ढूँढकर भेजनी होगी।` : "";
        return `नमस्ते ${name}, आवेदन के लिए धन्यवाद। पिन कोड ${pin} उपलब्ध नहीं है, लेकिन हम आपको ${city} का पिन कोड ${np} दे सकते हैं। ${note}\nस्वीकार करने के लिए इस संदेश का जवाब दें।\nस्थिति देखें: ${link}`;
      }
      const note = storeAndSpace ? `Your space can't be used because we already have a store at pin code ${pin}; you'll need a space in pin code ${np}.` : needsSpace ? `You'll need to find a space there within ${days} days.` : "";
      return `Hi ${name}, thank you for applying. Pin code ${pin} isn't available, but we can offer you pin code ${np} in ${city}. ${note}\nReply to this message to accept it.\nCheck your status: ${link}`;
    }
    case "needs_info": {
      const q = ASK_TEXT[lang][askKind(d.ask)];
      if (lang === "Kannada") return `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಅರ್ಜಿ ನಮಗೆ ಸಿಕ್ಕಿದೆ, ಧನ್ಯವಾದ. ಮುಂದುವರಿಯಲು ಒಂದು ಮಾಹಿತಿ ಬೇಕು: ${q}.\nಈ ಸಂದೇಶಕ್ಕೆ 7 ದಿನಗಳ ಒಳಗೆ ಉತ್ತರಿಸಿ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi") return `नमस्ते ${name}, आपका आवेदन हमें मिल गया, धन्यवाद। आगे बढ़ने के लिए हमें एक जानकारी चाहिए: ${q}।\nकृपया 7 दिन में इस संदेश का जवाब दें।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, thank you for applying. To move ahead we need one thing: ${q}.\nPlease reply to this message within 7 days.\nCheck your status: ${link}`;
    }
    case "waiting": {
      const pos = d.position;
      const offers = offerText(lang, d.offers);
      if (lang === "Kannada")
        return `ನಮಸ್ಕಾರ ${name}, ನಿಮ್ಮ ಅರ್ಜಿ ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ. ${pos ? `ನೀವು ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ ${pos}ನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದೀರಿ` : "ನೀವು ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿದ್ದೀರಿ"} — ಈ ಪ್ರದೇಶದಲ್ಲಿ ಅವಕಾಶಗಳು ಸೀಮಿತ, ಮತ್ತು ಬೇರೆ ಅರ್ಜಿದಾರರು ಮುಂದಿದ್ದಾರೆ.\n${offers}\nಅವಕಾಶ ಸಿಕ್ಕಾಗ ನಾವು ತಿಳಿಸುತ್ತೇವೆ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi")
        return `नमस्ते ${name}, आपका आवेदन देखा जा रहा है। ${pos ? `आप प्रतीक्षा सूची में ${pos} नंबर पर हैं` : "आप प्रतीक्षा सूची में हैं"} — इस इलाके में मौके सीमित हैं और दूसरे आवेदक आगे हैं।\n${offers}\nमौका मिलते ही हम आपको बताएँगे।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, your application is being reviewed. ${pos ? `You are number ${pos} on our waiting list` : "You are on our waiting list"} — openings in this area are limited and other applicants are ahead.\n${offers}\nWe will tell you as soon as an opening comes up.\nCheck your status: ${link}`;
    }
    case "not_in_plan": {
      const where = a.city || pin;
      if (lang === "Kannada") return `ನಮಸ್ಕಾರ ${name}, ಅರ್ಜಿ ಹಾಕಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಸದ್ಯಕ್ಕೆ ${where}ನಲ್ಲಿ ನಾವು ಸ್ಟೋರ್ ತೆರೆಯುತ್ತಿಲ್ಲ, ಆದ್ದರಿಂದ ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮುಂದುವರಿಸಲಾಗುವುದಿಲ್ಲ. ಇದು ಬದಲಾದರೆ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi") return `नमस्ते ${name}, आवेदन के लिए धन्यवाद। अभी हम ${where} में स्टोर नहीं खोल रहे हैं, इसलिए आपका आवेदन आगे नहीं बढ़ा सकते। स्थिति बदलने पर हम संपर्क करेंगे।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, thank you for applying. We aren't opening stores in ${where} right now, so we can't move your application forward. We will contact you if that changes.\nCheck your status: ${link}`;
    }
    case "withdrawn": {
      if (lang === "Kannada") return `ನಮಸ್ಕಾರ ${name}, ನೀವು ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಹಿಂತೆಗೆದುಕೊಂಡಿದ್ದೀರಿ ಎಂದು ನಾವು ದಾಖಲಿಸಿದ್ದೇವೆ. ಕಿಕ್ಸ್‌ನಲ್ಲಿ ಆಸಕ್ತಿ ತೋರಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಮನಸ್ಸು ಬದಲಾದರೆ ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi") return `नमस्ते ${name}, हमने दर्ज किया है कि आपने अपना आवेदन वापस ले लिया है। Kicks में रुचि दिखाने के लिए धन्यवाद। मन बदले तो इस संदेश का जवाब दें।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, we have noted that you have withdrawn your application. Thank you for your interest in Kicks. If you change your mind, just reply to this message.\nCheck your status: ${link}`;
    }
    default: {
      const rule = RULE_TEXT[lang][ruleKind(d)](a, d, asm);
      if (lang === "Kannada") return `ನಮಸ್ಕಾರ ${name}, ಅರ್ಜಿ ಹಾಕಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಸದ್ಯಕ್ಕೆ ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮುಂದುವರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ: ${rule}.\n${offerText(lang, d.offers)}\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi") return `नमस्ते ${name}, आवेदन करने के लिए धन्यवाद। अभी हम आपका आवेदन आगे नहीं बढ़ा सकते: ${rule}।\n${offerText(lang, d.offers)}\nस्थिति देखें: ${link}`;
      return `Hi ${name}, thank you for applying. We can't move your application forward right now: ${rule}.\n${offerText(lang, d.offers)}\nCheck your status: ${link}`;
    }
  }
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
