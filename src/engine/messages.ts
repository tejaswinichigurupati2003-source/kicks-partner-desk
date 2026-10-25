import { CONFIG } from "./config";
import type { Application, Decision, Language, Offer } from "./types";

export type AskKind = "pin" | "pinCity" | "space" | "size" | "investment" | "experience";
export type RuleKind = "store" | "money" | "duplicate" | "area";

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
  if (/already have a store/i.test(d.verdict)) return "store";
  if (/minimum/i.test(d.verdict)) return "money";
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

const RULE_TEXT: Record<Language, Record<RuleKind, (a: Application, d: Decision) => string>> = {
  English: {
    store: (a) => `we already have a Kicks store in pin code ${a.pin}, and we open only one store per pin code. We can look at another pin code nearby`,
    money: (_a, d) => `the investment is below the minimum we need (₹${Math.round((d.setupCost ?? 0) * CONFIG.minInvestmentShare * 10) / 10} lakh for this city). If you can raise it, please apply again`,
    duplicate: () => "we already have another application from you for the same pin code, and we are using that one",
    area: (a) => `we are not opening stores in pin code ${a.pin} right now. We will contact you when that changes`,
  },
  Kannada: {
    store: (a) => `ಪಿನ್ ಕೋಡ್ ${a.pin}ನಲ್ಲಿ ನಮ್ಮ ಕಿಕ್ಸ್ ಸ್ಟೋರ್ ಈಗಾಗಲೇ ಇದೆ, ಮತ್ತು ನಾವು ಒಂದು ಪಿನ್ ಕೋಡ್‌ನಲ್ಲಿ ಒಂದೇ ಸ್ಟೋರ್ ತೆರೆಯುತ್ತೇವೆ. ಹತ್ತಿರದ ಬೇರೆ ಪಿನ್ ಕೋಡ್ ನೋಡಬಹುದು`,
    money: (_a, d) => `ನಿಮ್ಮ ಹೂಡಿಕೆ ನಮಗೆ ಬೇಕಾದ ಕನಿಷ್ಠ ಮೊತ್ತಕ್ಕಿಂತ ಕಡಿಮೆ ಇದೆ (ಈ ನಗರಕ್ಕೆ ₹${Math.round((d.setupCost ?? 0) * CONFIG.minInvestmentShare * 10) / 10} ಲಕ್ಷ). ಮೊತ್ತ ಹೊಂದಿಸಲು ಸಾಧ್ಯವಾದರೆ ದಯವಿಟ್ಟು ಮತ್ತೆ ಅರ್ಜಿ ಹಾಕಿ`,
    duplicate: () => "ಅದೇ ಪಿನ್ ಕೋಡ್‌ಗೆ ನಿಮ್ಮ ಇನ್ನೊಂದು ಅರ್ಜಿ ನಮ್ಮ ಬಳಿ ಇದೆ, ಅದನ್ನೇ ನಾವು ಪರಿಗಣಿಸುತ್ತಿದ್ದೇವೆ",
    area: (a) => `ಸದ್ಯಕ್ಕೆ ಪಿನ್ ಕೋಡ್ ${a.pin}ನಲ್ಲಿ ನಾವು ಸ್ಟೋರ್ ತೆರೆಯುತ್ತಿಲ್ಲ. ಅದು ಬದಲಾದಾಗ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ`,
  },
  Hindi: {
    store: (a) => `पिन कोड ${a.pin} में हमारा Kicks स्टोर पहले से है, और हम एक पिन कोड में केवल एक स्टोर खोलते हैं। हम पास का कोई दूसरा पिन कोड देख सकते हैं`,
    money: (_a, d) => `आपका निवेश हमारी न्यूनतम सीमा से कम है (इस शहर के लिए ₹${Math.round((d.setupCost ?? 0) * CONFIG.minInvestmentShare * 10) / 10} लाख)। अगर आप रकम जुटा सकें तो कृपया दोबारा आवेदन करें`,
    duplicate: () => "उसी पिन कोड के लिए आपका एक और आवेदन हमारे पास है, और हम उसी को देख रहे हैं",
    area: (a) => `अभी हम पिन कोड ${a.pin} में स्टोर नहीं खोल रहे हैं। स्थिति बदलने पर हम आपसे संपर्क करेंगे`,
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
}

export function deadlineText(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + CONFIG.conditionDays);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Standard message in the applicant's language. Greets by name, no scores, no other applicants. */
export function buildMessage(a: Application, d: Decision, lang: Language, facts: MessageFacts): string {
  const { link, now } = facts;
  const name = a.name || (lang === "English" ? "there" : "");
  const pin = a.pin;
  const city = a.city;
  const open = CONFIG.weeksToOpenWithSpace;

  switch (d.status) {
    case "approved": {
      if (lang === "Kannada")
        return `ನಮಸ್ಕಾರ ${name}, ಶುಭ ಸುದ್ದಿ! ${city}ದ ಪಿನ್ ಕೋಡ್ ${pin}ನಲ್ಲಿ ಕಿಕ್ಸ್ ಸ್ಟೋರ್ ತೆರೆಯಲು ನಿಮಗೆ ಅವಕಾಶ ಸಿಕ್ಕಿದೆ.\nಮೊದಲ ಮೂರು ಕೆಲಸಗಳು: 1) ಗುರುತು ಮತ್ತು ವಿಳಾಸದ ದಾಖಲೆ ಕಳುಹಿಸಿ, 2) ಅಂಗಡಿ ಭೇಟಿಗೆ ಜಾಗ ಸಿದ್ಧವಾಗಿಡಿ, 3) ಬ್ಯಾಂಕ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಸಿದ್ಧವಾಗಿಡಿ.\nನಮ್ಮ ವಿಸ್ತರಣಾ ತಂಡ 2 ಕೆಲಸದ ದಿನಗಳಲ್ಲಿ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತದೆ. ಸುಮಾರು ${open} ವಾರಗಳಲ್ಲಿ ಸ್ಟೋರ್ ತೆರೆಯುವ ನಿರೀಕ್ಷೆ ಇದೆ.\nಪ್ರಗತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi")
        return `नमस्ते ${name}, खुशखबरी! ${city} के पिन कोड ${pin} में Kicks स्टोर खोलने के लिए आपको मौका मिला है।\nपहले तीन काम: 1) पहचान और पते का प्रमाण भेजें, 2) दुकान की जगह साइट विज़िट के लिए तैयार रखें, 3) बैंक स्टेटमेंट तैयार रखें।\nहमारी विस्तार टीम 2 कार्यदिवस में आपको फोन करेगी। स्टोर लगभग ${open} हफ्तों में खुलने की उम्मीद है।\nप्रगति देखें: ${link}`;
      return `Hi ${name}, good news! Kicks has an opening for you at pin code ${pin} in ${city}.\nYour first three steps: 1) send your ID and address proof, 2) keep the shop ready for a site visit, 3) keep your bank statements ready.\nOur expansion team will call you within 2 working days. We expect your store to open in about ${open} weeks.\nTrack your progress: ${link}`;
    }
    case "conditional": {
      const date = deadlineText(now);
      const conds = d.condition.map((c) => c.kind);
      const en = d.condition.map((c) => c.text.replace(/ within \d+ days\.?$/, "")).join("; ");
      const kn = conds
        .map((k) =>
          k === "space" ? "ಅಂಗಡಿ ಜಾಗ ಹುಡುಕಿ ವಿವರ ಕಳುಹಿಸಿ" : k === "floor" ? "ಮೇಲಿನ ಮಹಡಿಯ ಅಂಗಡಿಗೆ ಗ್ರಾಹಕರನ್ನು ಹೇಗೆ ಕರೆತರುತ್ತೀರಿ ಎಂದು ತಿಳಿಸಿ, ಅಥವಾ ನೆಲ ಮಹಡಿಯ ಆಯ್ಕೆ ಕಳುಹಿಸಿ" : "ಹೆಚ್ಚುವರಿ ಹಣದ (ಸಾಲ ಅಥವಾ ಸ್ವಂತ ಹಣ) ಪುರಾವೆ ತೋರಿಸಿ",
        )
        .join("; ");
      const hi = conds
        .map((k) =>
          k === "space" ? "दुकान की जगह ढूँढकर उसकी जानकारी भेजें" : k === "floor" ? "ऊपरी मंज़िल की दुकान पर ग्राहक कैसे लाएँगे यह बताएँ, या ग्राउंड फ्लोर का विकल्प भेजें" : "अतिरिक्त रकम (लोन या अपना पैसा) का प्रमाण दिखाएँ",
        )
        .join("; ");
      if (lang === "Kannada")
        return `ನಮಸ್ಕಾರ ${name}, ಶುಭ ಸುದ್ದಿ! ${city}ದ ಪಿನ್ ಕೋಡ್ ${pin}ನಲ್ಲಿ ನಿಮಗೆ ಒಂದು ಅವಕಾಶವನ್ನು ಕಾಯ್ದಿರಿಸಿದ್ದೇವೆ.\nಒಂದು ಷರತ್ತು ಇದೆ: ${kn}. ${date}ರ ಒಳಗೆ ಇದನ್ನು ಮಾಡಬೇಕು.\nಅಷ್ಟರೊಳಗೆ ಆಗದಿದ್ದರೆ ಅವಕಾಶವನ್ನು ಮುಂದಿನ ಅರ್ಜಿದಾರರಿಗೆ ನೀಡಲಾಗುತ್ತದೆ.\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi")
        return `नमस्ते ${name}, खुशखबरी! ${city} के पिन कोड ${pin} में हमने आपके लिए एक स्टोर का मौका रोककर रखा है।\nएक शर्त है: ${hi}। यह ${date} तक करना होगा।\nतब तक न हो पाया तो यह मौका अगले आवेदक को दे दिया जाएगा।\nस्थिति देखें: ${link}`;
      return `Hi ${name}, good news! We are holding an opening for you at pin code ${pin} in ${city}.\nOne condition: ${en}. Please do this by ${date}.\nIf it isn't done by then, the opening goes to the next applicant.\nCheck your status: ${link}`;
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
    case "not_eligible": {
      const rule = RULE_TEXT[lang][ruleKind(d)](a, d);
      if (lang === "Kannada") return `ನಮಸ್ಕಾರ ${name}, ಅರ್ಜಿ ಹಾಕಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಸದ್ಯಕ್ಕೆ ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮುಂದುವರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ: ${rule}.\n${offerText(lang, d.offers)}\nಸ್ಥಿತಿ ನೋಡಿ: ${link}`;
      if (lang === "Hindi") return `नमस्ते ${name}, आवेदन करने के लिए धन्यवाद। अभी हम आपका आवेदन आगे नहीं बढ़ा सकते: ${rule}।\n${offerText(lang, d.offers)}\nस्थिति देखें: ${link}`;
      return `Hi ${name}, thank you for applying. We can't move your application forward right now: ${rule}.\n${offerText(lang, d.offers)}\nCheck your status: ${link}`;
    }
  }
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
