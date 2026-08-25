// Onboarding field definitions — the single source of truth used by ALL of:
//   • /onboarding    → render the native Resonance Identity Foundation Form
//                      (exact question wording + helper text live here).
//   • /api/intake    → map the legacy GHL webhook payload (keyed by the OLD
//                      form labels) to onboarding_responses columns.
//   • admin editor   → the per-client onboarding editor and the client-facing
//                      "My answers" view are both driven off groupedOnboarding.
//   • generation     → build the grouped Q&A block that becomes Claude's user
//                      message.
//
// ── Structure ────────────────────────────────────────────────────────────
// ONBOARDING_QUESTIONS is the primary model: one entry per question on the
// PDF, in form order, carrying the EXACT wording and the EXACT helper text.
// A question owns one or more input boxes; seven questions ask for two
// genuinely different things and so own two columns (see `half`).
//
// ONBOARDING_FIELDS is the flat, column-keyed projection of that model, plus
// LEGACY_FIELDS. It keeps the shape every existing consumer already expects.
//
// ── The aliases field ────────────────────────────────────────────────────
// The GHL form asked different questions with different labels. mapIntakePayload
// matches on label, so re-labelling a reused column to the new Resonance wording
// would silently stop the webhook matching it. Every column the GHL form fed
// therefore keeps its old label in `aliases`, and /api/intake behaviour is
// unchanged. (Those labels were best-effort to begin with — see git history —
// so they are preserved verbatim rather than corrected.)

export type OnboardingPart =
  | "THE BASICS"
  | "YOUR CONTENT"
  | "YOUR BUSINESS"
  | "WHERE YOUR BRAND IS NOW"
  | "YOUR MISSION AND DRIVE"
  | "YOUR STORY"
  | "YOUR CONVICTION AND POSITIONING"
  | "YOUR IDEAL CLIENT"
  | "CLIENT RESULTS"
  | "YOUR VOICE"
  | "YOUR WORLD"
  | "WHERE YOU'RE STUCK"
  | "YOUR GOALS"
  | "EARLIER ANSWERS (GHL FORM)";

/** Kept as the old export name — every existing consumer imports this. */
export type OnboardingGroup = OnboardingPart;

export interface OnboardingInput {
  /** onboarding_responses column name */
  column: string;
  /** Names this box. For a single-box question this IS the question; for a
   *  split question it names that half. Used by the admin editor, the client
   *  "My answers" view and the Q&A block sent to Claude. */
  label: string;
  input: "text" | "textarea" | "select" | "checkboxes";
  options?: string[];
  placeholder?: string;
  /** Set when this box is one half of a two-box question. */
  half?: true;
}

export interface OnboardingQuestion {
  part: OnboardingPart;
  /** EXACT question wording from the Resonance Identity Foundation Form. */
  question: string;
  /** EXACT helper text from the form. This is what coaches the client into
   *  answering deeply — render it under the question, never paraphrase it. */
  helper?: string;
  fields: OnboardingInput[];
}

/** Part-level preamble from the form. Rendered under the part heading. */
export const PART_INTROS: Partial<Record<OnboardingPart, string>> = {
  "YOUR MISSION AND DRIVE":
    "This is the stuff that keeps you going when the content flops, when nobody's watching, when you question whether any of this is worth it. Without it, your content never carries the weight it needs to actually connect.",
  "YOUR STORY":
    "Your story is the most powerful content asset you have. Not your expertise, not your offer — your story. People don't connect with credentials. They connect with humanity.",
  "YOUR CONVICTION AND POSITIONING":
    "This is what makes you a one-of-one. Not your offer — your worldview. What you believe, what you hate, what you refuse to do, what you do differently. When someone watches your content, they should either think \"this person gets it\" or \"this isn't for me.\" Neutral is the only reaction that doesn't work.",
  "YOUR IDEAL CLIENT":
    "Who you attract with your content is not random. Every word, every claim you make is either pulling in the right people or pushing out the wrong ones. The sharper this is, the sharper every piece of content becomes.",
  "CLIENT RESULTS":
    "Results show your audience that people like them got results with someone like you. The client is the hero — not you.",
  "YOUR VOICE":
    "Your voice is what makes content sound like you and not a template. When your bot generates scripts or we write your content plan, it needs to sound like words that would actually come out of your mouth.",
  "YOUR WORLD":
    "Your personal brand is like a Netflix show. People don't tune in for one episode — they come back because they want to be inside your world. Characters, locations, recurring moments. That's what makes it feel alive.",
  "WHERE YOU'RE STUCK":
    "The thing keeping you stuck is usually not what it looks like on the surface. \"I need more followers\" and \"I don't know what to post\" are symptoms. We need to find the root — because that's where the real work is, and that's where the real content lives.",
};

// ─────────────────────────────────────────────────────────────────────────
// The form. Order here is the order the client sees.
// ─────────────────────────────────────────────────────────────────────────
export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  // ── PART 1 ────────────────────────────────────────────────────────────
  {
    part: "THE BASICS",
    question: "Describe yourself in 3 words.",
    helper:
      "Not your job title. Three words that describe who you actually are as a person — your energy, your character. If the first three that come to mind are \"driven, ambitious, passionate\", try again.",
    fields: [
      { column: "describe_yourself_3_words", label: "Describe yourself in 3 words", input: "text" },
    ],
  },
  {
    // Not on the PDF. Kept because `timezone` already exists, is read by the
    // prompts, and is operationally useful for scheduling.
    part: "THE BASICS",
    question: "What timezone are you in?",
    helper: "So we schedule your content and check-ins at hours that make sense for you.",
    fields: [{ column: "timezone", label: "Your timezone", input: "text" }],
  },

  // ── PART 2 ────────────────────────────────────────────────────────────
  {
    part: "YOUR CONTENT",
    question: "Link your Instagram profile.",
    fields: [{ column: "instagram_url", label: "Instagram profile", input: "text" }],
  },
  {
    part: "YOUR CONTENT",
    question: "Link your YouTube channel (skip if you don't have one).",
    fields: [{ column: "youtube_url", label: "YouTube channel", input: "text" }],
  },
  {
    part: "YOUR CONTENT",
    question: "Drop the URLs of your 3 best-performing Instagram reels.",
    helper:
      "If you're not sure which ones, pick the three with the most engagement, or the three you're most proud of. If you haven't posted reels yet, write \"not yet.\"",
    fields: [{ column: "top_reels_urls", label: "Top 3 reels", input: "textarea" }],
  },
  {
    part: "YOUR CONTENT",
    question: "How often are you currently posting?",
    helper:
      "Across all platforms. \"Barely\" and \"inconsistently\" are both valid answers — we need the truth, not the answer that sounds good.",
    fields: [{ column: "posting_frequency", label: "How often you currently post", input: "textarea" }],
  },
  {
    part: "YOUR CONTENT",
    question: "What types of content have performed well so far?",
    helper:
      "Specific formats, topics, styles. What's actually got attention or DMs, not what you hoped would.",
    fields: [
      { column: "content_performed_well", label: "Content that has performed well for you", input: "textarea" },
    ],
  },
  {
    part: "YOUR CONTENT",
    question: "What feels natural to make — and what feels unnatural or forced?",
    helper:
      "Both sides. What comes easily, and what feels like you're performing when you do it.",
    fields: [
      { column: "content_feels_easy", label: "What feels natural", input: "textarea", half: true },
      { column: "content_feels_difficult", label: "What feels unnatural or forced", input: "textarea", half: true },
    ],
  },

  // ── PART 3 ────────────────────────────────────────────────────────────
  {
    part: "YOUR BUSINESS",
    question: "What do you actually sell?",
    helper:
      "Not \"I'm a coach\" or \"I do consulting.\" What does someone get when they pay you? What's the transformation they walk away with? If you have multiple offers, list them all with prices.",
    fields: [{ column: "products_services", label: "What you sell", input: "textarea" }],
  },
  {
    part: "YOUR BUSINESS",
    question: "How much are you making per month right now?",
    helper:
      "Rough is fine. We need this to understand where you're starting from and what targets are realistic. No judgement either way — it's just a starting point.",
    fields: [{ column: "current_monthly_revenue", label: "Current monthly revenue", input: "text" }],
  },
  {
    part: "YOUR BUSINESS",
    question: "How are you currently getting clients?",
    helper:
      "Outreach, ads, referrals, content, word of mouth, nothing consistent? Be honest about what's working and what isn't. \"I'm not really sure\" is a legitimate answer — write it if it's true.",
    fields: [{ column: "how_people_find_you", label: "How people currently find you", input: "textarea" }],
  },
  {
    part: "YOUR BUSINESS",
    question: "Which platforms are you focusing on?",
    fields: [
      {
        column: "platforms",
        label: "Platforms you are focusing on",
        input: "checkboxes",
        options: ["Instagram", "TikTok", "LinkedIn", "X", "YouTube", "Facebook"],
      },
    ],
  },

  // ── PART 4 ────────────────────────────────────────────────────────────
  {
    part: "WHERE YOUR BRAND IS NOW",
    question: "Give us the honest snapshot of where your brand is at.",
    helper:
      "Follower count across platforms. How long you've been posting. What's working. What isn't. Whether people are engaging or it feels like talking to a wall. If you've barely started, just say that.",
    fields: [{ column: "brand_snapshot", label: "Where your brand is now", input: "textarea" }],
  },
  {
    part: "WHERE YOUR BRAND IS NOW",
    question: "What makes you different from others in your industry?",
    helper:
      "Not \"I'm more authentic\" or \"I actually care.\" What specifically — from your story, your background, your approach — sets you apart from the hundred other people claiming to do what you do?",
    fields: [{ column: "what_makes_you_different", label: "What makes you different", input: "textarea" }],
  },
  {
    part: "WHERE YOUR BRAND IS NOW",
    question: "How do you want people to feel when they see your content?",
    fields: [{ column: "how_people_should_feel", label: "How you want people to feel", input: "textarea" }],
  },
  {
    part: "WHERE YOUR BRAND IS NOW",
    question: "What does success on social media actually look like to you?",
    helper:
      "Be specific. A number of DMs from the right people? Calls booked? Revenue directly from content? \"Just growth\" isn't specific enough.",
    fields: [{ column: "success_definition", label: "How you define success", input: "textarea" }],
  },

  // ── PART 5 ────────────────────────────────────────────────────────────
  {
    part: "YOUR MISSION AND DRIVE",
    question: "Why do you do what you do — and what actually led you here?",
    helper:
      "Not the version you'd put on a website. What actually happened — the moment, the conversation, the realisation — that led you to build this specific thing? Go past \"to make money.\" What problem did you experience yourself that made you think someone needs to fix this? What would you keep doing even if nobody paid you for it?",
    fields: [{ column: "what_inspired_business", label: "Why you do what you do", input: "textarea" }],
  },
  {
    part: "YOUR MISSION AND DRIVE",
    question: "What drives you when motivation disappears?",
    helper:
      "Motivation is temporary. What's underneath it — the thing that doesn't go away? Proving someone wrong? Providing for someone you love? A version of your life you refuse to go back to? Name the real driver.",
    fields: [{ column: "deeper_driver", label: "What drives you underneath the motivation", input: "textarea" }],
  },
  {
    part: "YOUR MISSION AND DRIVE",
    question: "What discomforts are you running from?",
    helper:
      "Every desire is downstream from a discomfort. The life you want exists because there's a life you refuse to accept. Financial stress, a job that drained you, a relationship that held you back, feeling invisible, watching other people live the life you want. Be specific — the discomfort is the fuel.",
    fields: [{ column: "discomforts_running_from", label: "Discomforts you are running from", input: "textarea" }],
  },
  {
    part: "YOUR MISSION AND DRIVE",
    question: "What does your ideal life actually look like?",
    helper:
      "Not what Instagram says success is. Yours. What does your ideal Tuesday look like — from the moment you wake up to the moment you go to sleep? Where are you? Who are you with? What are you working on? How much are you making, and how? Paint the whole picture.",
    fields: [{ column: "ideal_life", label: "Your ideal life", input: "textarea" }],
  },

  // ── PART 6 ────────────────────────────────────────────────────────────
  {
    part: "YOUR STORY",
    question: "What are the key moments that shaped who you are?",
    helper:
      "Just list them — wins, losses, turning points, leaps, decisions that scared you, relationships that changed everything, rock bottoms, moments where you stepped into the unknown. We'll build from them. Get as many down as you can.",
    fields: [{ column: "key_life_moments", label: "Key moments that shaped you", input: "textarea" }],
  },
  {
    part: "YOUR STORY",
    question: "How did you actually get here?",
    helper:
      "Tell it the way you'd tell a mate over a drink. Not a LinkedIn bio. Where did it start? What were you doing before? What happened that led you here? What did it actually feel like at each stage?",
    fields: [{ column: "origin_story", label: "How you got here", input: "textarea" }],
  },
  {
    part: "YOUR STORY",
    question: "What was your lowest point?",
    helper:
      "The actual moment, not a summary of a difficult period. Where were you physically? What were you feeling — not \"bad,\" but specifically: trapped, ashamed, terrified, alone, invisible, like a fraud? What was going through your head? Write it like a scene — because when you tell this story on camera, that's exactly what it needs to feel like.",
    fields: [{ column: "lowest_point", label: "Your lowest point", input: "textarea" }],
  },
  {
    part: "YOUR STORY",
    question: "What shifted?",
    helper:
      "Not \"I decided to change.\" What specifically happened — a conversation, a decision, a person, a moment where something snapped — that made you think and move differently?",
    fields: [{ column: "what_shifted", label: "What shifted", input: "textarea" }],
  },

  // ── PART 7 ────────────────────────────────────────────────────────────
  {
    part: "YOUR CONVICTION AND POSITIONING",
    question: "What do you hate about your industry?",
    helper:
      "The beliefs, behaviours, and nonsense you see in your space. The advice being given that you know is wrong. The type of person in your niche that makes you cringe. Don't say \"fake gurus\" — what specifically do they do? Why does it wind you up? What would you say to them if you could?",
    fields: [{ column: "industry_hates", label: "What you hate about your industry", input: "textarea" }],
  },
  {
    part: "YOUR CONVICTION AND POSITIONING",
    question: "What do you believe that most people in your space would push back on?",
    helper:
      "Your contrarian takes. Things you've learned through experience that contradict what everyone else teaches. These become the content that makes you stand out — because everyone else is saying the same thing and you're saying something different.",
    fields: [{ column: "contrarian_beliefs", label: "Your contrarian beliefs", input: "textarea" }],
  },
  {
    part: "YOUR CONVICTION AND POSITIONING",
    question: "How do you help people differently — and what do you want to be known for?",
    helper:
      "Not \"I'm more human.\" What's your actual approach — a framework, a methodology, a philosophy, a way of working that gets results nobody else gets quite the same way? Even if it's not packaged yet, get the raw version down. Then: the sentence people say when they describe you — \"You need to follow them, they're the one who...\" — what?",
    fields: [
      { column: "unique_approach", label: "How you help people differently", input: "textarea", half: true },
      { column: "known_for", label: "What you want to be known for", input: "textarea", half: true },
    ],
  },
  {
    part: "YOUR CONVICTION AND POSITIONING",
    question: "What are your core values, and why do you hold each one?",
    helper:
      "3 to 5 things you actually live by — the non-negotiables. For each one: what happened in your life that made you believe it? A value without a story behind it is just a word.",
    fields: [{ column: "core_values", label: "Your core values and why", input: "textarea" }],
  },

  // ── PART 8 ────────────────────────────────────────────────────────────
  {
    part: "YOUR IDEAL CLIENT",
    question: "Describe your ideal client as a specific human being.",
    helper:
      "Not \"entrepreneurs.\" A real person. What age? What stage — just started, been at it for a while, making money but stuck? What does their daily life actually look like? Where are they and what are they doing?",
    fields: [{ column: "ideal_client", label: "Your ideal client", input: "textarea" }],
  },
  {
    part: "YOUR IDEAL CLIENT",
    question: "What is the ONE core problem they face?",
    helper:
      "The big one. The thing that, if you solved it, everything else falls into place for them. Not five problems — the problem.",
    fields: [{ column: "client_struggles", label: "Their one core problem", input: "textarea" }],
  },
  {
    part: "YOUR IDEAL CLIENT",
    question: "What are their 2am thoughts — and the war inside their head day to day?",
    helper:
      "The exact phrases running through their head when they can't sleep. The imposter syndrome, comparison, self-doubt, fear of judgement, feeling behind. Write them in quotes — these literally become your hooks.",
    fields: [{ column: "client_2am_thoughts", label: "Their 2am thoughts", input: "textarea" }],
  },
  {
    part: "YOUR IDEAL CLIENT",
    question: "What do they actually want?",
    helper:
      "Specific dream outcomes. Not \"more clients\" — how many, at what price, by when? What lifestyle? What feeling are they chasing? Be concrete.",
    fields: [{ column: "client_goals_desires", label: "What they actually want", input: "textarea" }],
  },
  {
    part: "YOUR IDEAL CLIENT",
    question: "Who is NOT your client?",
    helper:
      "The wrong fit. What beliefs or behaviours make someone a bad match for working with you? Who would you turn away, and why?",
    fields: [{ column: "not_your_client", label: "Who is not your client", input: "textarea" }],
  },

  // ── PART 9 ────────────────────────────────────────────────────────────
  {
    part: "CLIENT RESULTS",
    question: "What are your biggest client wins — and tell the story of your best transformation.",
    helper:
      "Specific numbers, transformations, and timeframes first. Not \"I helped people improve\" — how much improvement, in how long, from where to where? Then pick one person and tell the full story: where were they when they came to you, what were they struggling with, what did you do together, what's different about their life now. Story, not case study.",
    fields: [
      { column: "client_wins", label: "Your biggest client wins", input: "textarea", half: true },
      { column: "best_transformation_story", label: "Your best transformation, told as a story", input: "textarea", half: true },
    ],
  },
  {
    part: "CLIENT RESULTS",
    question: "Do you have testimonials — video or written?",
    helper:
      "If yes, transcribe or paste them below, clearly labelled. If not, this is one of the first things to sort.",
    fields: [{ column: "testimonials", label: "Testimonials", input: "textarea" }],
  },

  // ── PART 10 ───────────────────────────────────────────────────────────
  {
    part: "YOUR VOICE",
    question: "Which creators or brands genuinely inspire you, and why?",
    helper:
      "People whose content makes you think \"I wish I could do that\" or \"that's the energy I want.\" Be specific about WHY — how they talk, the topics they pick, the rawness, the humour, the editing. Don't just drop a name.",
    fields: [{ column: "creators_brands_inspire", label: "Creators or brands that inspire you", input: "textarea" }],
  },
  {
    part: "YOUR VOICE",
    question: "Drop 2 to 3 creators who make you cringe or who you think are doing it wrong.",
    helper:
      "What specifically turns you off? The fake energy? The recycled frameworks? The way they talk? What you reject is part of your identity — don't hold back.",
    fields: [{ column: "creators_that_cringe", label: "Creators who make you cringe", input: "textarea" }],
  },
  {
    part: "YOUR VOICE",
    question: "How do you naturally talk?",
    helper:
      "Direct? Calm? High energy? Dry humour? Self-deprecating? Storytelling-heavy? Think about how your mates would describe the way you explain things — with analogies, stories, straight to the point?",
    fields: [{ column: "how_you_talk", label: "How you naturally talk", input: "textarea" }],
  },
  {
    part: "YOUR VOICE",
    question: "Do you swear? How much?",
    helper:
      "None / Light (damn, crap) / Moderate (shit, arse) / Heavy (fuck, bollocks). Give 2 to 3 examples of how you'd naturally say something in conversation.",
    fields: [
      {
        column: "swearing_level",
        label: "Swearing level",
        input: "select",
        options: [
          "None",
          "Light (damn, crap)",
          "Moderate (shit, arse)",
          "Heavy (fuck, bollocks)",
        ],
        half: true,
      },
      {
        column: "speech_examples",
        label: "2 to 3 examples of how you'd naturally say something",
        input: "textarea",
        half: true,
      },
    ],
  },
  {
    part: "YOUR VOICE",
    question: "What phrases do you use all the time — and what words would never come out of your mouth?",
    helper:
      "Catchphrases, filler words, expressions that are just you (minimum 5 — you have them, you just don't notice them). Then flip it: the specific words, tones, or phrases that would sound fake if you said them. The things that, if you saw them in a script, you'd immediately cross out.",
    fields: [
      { column: "catchphrases", label: "Phrases you use all the time", input: "textarea", half: true },
      { column: "words_never_say", label: "Words that would never come out of your mouth", input: "textarea", half: true },
    ],
  },

  // ── PART 11 ───────────────────────────────────────────────────────────
  {
    part: "YOUR WORLD",
    question: "Who are the characters in your world?",
    helper:
      "The people who show up in your life and would naturally appear in your stories — partner, best mate, business partner, family, a client, a mentor. Real names or nicknames. These become the recurring cast your audience grows to know.",
    fields: [{ column: "characters_in_world", label: "The characters in your world", input: "textarea" }],
  },
  {
    part: "YOUR WORLD",
    question: "What are your interests and hobbies outside of work?",
    helper:
      "The things that make you three-dimensional. Not another person in your niche talking only about your niche — what do you do, care about, and engage with beyond the business?",
    fields: [{ column: "interests_hobbies", label: "Interests and hobbies outside work", input: "textarea" }],
  },
  {
    part: "YOUR WORLD",
    question: "Describe the old version of you versus the new version.",
    helper:
      "Who were you before? Who are you becoming? What did the old you believe, do, accept, tolerate? What does the new you refuse to go back to? A lot of your audience is living as the old version of you right now — this is where the deepest connection happens.",
    fields: [{ column: "old_self_vs_new_self", label: "Old you versus new you", input: "textarea" }],
  },

  // ── PART 12 ───────────────────────────────────────────────────────────
  {
    part: "WHERE YOU'RE STUCK",
    question: "What's ACTUALLY keeping you stuck — and what scares you about putting yourself out there?",
    helper:
      "Not the polished answer. The real one. The thing you'd admit to a close friend at 2am but wouldn't put on a story. Fear, confusion, overwhelm, not knowing who you are deeply enough to communicate it, imposter syndrome, feeling behind. And: judgement from people you know? Looking stupid? The silence — posting something real and getting nothing back? Your family seeing it? Name every fear. The ones you name lose power.",
    fields: [
      { column: "biggest_challenge", label: "What's actually keeping you stuck", input: "textarea", half: true },
      { column: "fears_about_visibility", label: "What scares you about putting yourself out there", input: "textarea", half: true },
    ],
  },
  {
    part: "WHERE YOU'RE STUCK",
    question: "What's the loop running in your head — and what gets in the way of posting consistently?",
    helper:
      "The recurring conversation, written exactly as it sounds: \"I should be posting but...\" / \"I know content is the answer but...\" / \"What if I put in all this effort and nothing changes...\" Then the practical blockers — time, confidence, not knowing what to post, perfectionism. Be specific on both.",
    fields: [
      { column: "mental_loop", label: "The loop running in your head", input: "textarea", half: true },
      { column: "content_creation_blockers", label: "What gets in the way of posting consistently", input: "textarea", half: true },
    ],
  },
  {
    part: "WHERE YOU'RE STUCK",
    question: "What have you already tried that didn't work the way you hoped?",
    helper:
      "Courses, strategies, posting randomly, copying someone else's style, hiring someone, doing it yourself. What happened? Why didn't it work? What did it feel like when it didn't?",
    fields: [{ column: "what_didnt_work", label: "What you have tried that didn't work", input: "textarea" }],
  },
  {
    part: "WHERE YOU'RE STUCK",
    question: "What skills do you know you need to improve?",
    helper: "Messaging, filming, presence on camera, sales, confidence, editing — be honest.",
    fields: [{ column: "skills_to_improve", label: "Skills you want to improve", input: "textarea" }],
  },

  // ── PART 13 ───────────────────────────────────────────────────────────
  {
    part: "YOUR GOALS",
    question: "What are your top three goals for the next 16 weeks?",
    helper:
      "Specific. Not \"grow my audience\" — by how much, on which platform, measured how? Not \"get clients\" — how many, at what price, through what method?",
    fields: [{ column: "top_three_goals", label: "Your top three goals", input: "textarea" }],
  },
  {
    part: "YOUR GOALS",
    question: "What would feel like a real breakthrough win from working with us?",
    helper:
      "Not five things. The one outcome that, if it happened, would make everything feel different.",
    fields: [{ column: "breakthrough_win", label: "A breakthrough win you want", input: "textarea" }],
  },
  {
    part: "YOUR GOALS",
    question: "What are you most nervous about going into this?",
    fields: [{ column: "most_nervous_about", label: "What you are most nervous about", input: "textarea" }],
  },
  {
    part: "YOUR GOALS",
    question: "What's one thing you want us to understand about you?",
    fields: [{ column: "understand_about_you", label: "What you want us to understand about you", input: "textarea" }],
  },
];

/** Old GHL labels, by column. Preserved verbatim so /api/intake keeps matching
 *  the columns it matches today even though the questions have been reworded. */
const GHL_ALIASES: Record<string, string> = {
  describe_yourself_3_words: "Describe yourself in three words",
  what_makes_you_different: "What makes you different",
  what_inspired_business: "What inspired you to start your business",
  one_sentence_description: "Describe what you do in one sentence",
  how_people_should_feel: "How do you want people to feel when they find you",
  creators_brands_inspire: "Creators or brands that inspire you",
  client_types: "The types of clients you work with",
  audience_reflects_ideal: "Does your current audience reflect your ideal client",
  ideal_client: "Describe your ideal client",
  client_struggles: "What your ideal client struggles with",
  client_misconceptions: "Misconceptions your ideal client has",
  client_goals_desires: "Your ideal client's goals and desires",
  success_definition: "How you define success",
  top_three_goals: "Your top three goals",
  breakthrough_win: "A breakthrough win you want",
  platforms: "Platforms you are on",
  posting_frequency: "How often you currently post",
  timezone: "Your timezone",
  content_performed_well: "Content that has performed well for you",
  content_feels_easy: "Content that feels easy to create",
  content_feels_difficult: "Content that feels difficult to create",
  existing_content_system: "Your existing content system",
  products_services: "Your products and services",
  how_people_find_you: "How people currently find you",
  client_objections: "Common objections from potential clients",
  biggest_challenge: "Your biggest challenge right now",
  content_creation_blockers: "What blocks you from creating content",
  skills_to_improve: "Skills you want to improve",
  what_didnt_work: "What has not worked for you before",
  most_nervous_about: "What you are most nervous about",
  understand_about_you: "What you want me to understand about you",
  anything_else: "Anything else you want to share",
};

export interface OnboardingField {
  /** onboarding_responses column name */
  column: string;
  /** human question label — how it appears in the Q&A block and the editors */
  label: string;
  group: OnboardingPart;
  /** extra keys mapIntakePayload will also match on (old GHL labels) */
  aliases?: string[];
  /** true for columns the GHL form fed that the Resonance form no longer asks.
   *  Kept so existing clients' answers stay visible, editable and available to
   *  generation — they are simply absent from the native form. */
  legacy?: true;
}

/** Columns the old GHL form fed that the Resonance form has no question for.
 *  NOT dropped — existing clients still have answers in them. */
const LEGACY_FIELDS: OnboardingField[] = (
  [
    ["one_sentence_description", "Describe what you do in one sentence"],
    ["client_types", "The types of clients you work with"],
    ["audience_reflects_ideal", "Does your current audience reflect your ideal client"],
    ["client_misconceptions", "Misconceptions your ideal client has"],
    ["client_objections", "Common objections from potential clients"],
    ["existing_content_system", "Your existing content system"],
    ["anything_else", "Anything else you want to share"],
  ] as const
).map(([column, label]) => ({
  column,
  label,
  group: "EARLIER ANSWERS (GHL FORM)" as const,
  aliases: [GHL_ALIASES[column]].filter(Boolean) as string[],
  legacy: true as const,
}));

// Order matters: this is the order fields appear in the generated Q&A block.
export const ONBOARDING_FIELDS: OnboardingField[] = [
  ...ONBOARDING_QUESTIONS.flatMap((q) =>
    q.fields.map((f) => {
      const alias = GHL_ALIASES[f.column];
      return {
        column: f.column,
        label: f.label,
        group: q.part,
        ...(alias ? { aliases: [alias] } : {}),
      };
    })
  ),
  ...LEGACY_FIELDS,
];

export const GROUP_ORDER: OnboardingPart[] = [
  "THE BASICS",
  "YOUR CONTENT",
  "YOUR BUSINESS",
  "WHERE YOUR BRAND IS NOW",
  "YOUR MISSION AND DRIVE",
  "YOUR STORY",
  "YOUR CONVICTION AND POSITIONING",
  "YOUR IDEAL CLIENT",
  "CLIENT RESULTS",
  "YOUR VOICE",
  "YOUR WORLD",
  "WHERE YOU'RE STUCK",
  "YOUR GOALS",
  "EARLIER ANSWERS (GHL FORM)",
];

/** The 13 parts of the native form, in order (excludes the legacy group). */
export const FORM_PARTS: OnboardingPart[] = GROUP_ORDER.filter(
  (g) => g !== "EARLIER ANSWERS (GHL FORM)"
);

/** Questions belonging to one part, in form order. */
export function questionsForPart(part: OnboardingPart): OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS.filter((q) => q.part === part);
}

/** Every column the native form writes. */
export const FORM_COLUMNS: string[] = ONBOARDING_QUESTIONS.flatMap((q) =>
  q.fields.map((f) => f.column)
);

/** Group the onboarding fields in display order, pairing each with its answer
 *  from `responses`. Used by the client "My answers" view and the admin editor.
 *  The legacy group is omitted entirely unless the row actually has data in it,
 *  so clients who came through the native form never see an empty section. */
export function groupedOnboarding(
  responses: Record<string, unknown> | null | undefined
): { group: OnboardingPart; fields: { column: string; label: string; value: string }[] }[] {
  const read = (column: string) => {
    const v = responses?.[column];
    return v === null || v === undefined ? "" : String(v);
  };

  return GROUP_ORDER.map((group) => ({
    group,
    fields: ONBOARDING_FIELDS.filter((f) => f.group === group).map((f) => ({
      column: f.column,
      label: f.label,
      value: read(f.column),
    })),
  })).filter(
    (g) =>
      g.fields.length > 0 &&
      (g.group !== "EARLIER ANSWERS (GHL FORM)" ||
        g.fields.some((f) => f.value.trim().length > 0))
  );
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Map an inbound GHL webhook payload (keyed by form label OR column name) to
 * the subset of onboarding_responses columns. Unknown keys are ignored; empty
 * strings become null.
 *
 * Matches on the current label, the column name, AND every alias — so the GHL
 * form's original labels keep resolving after the Resonance rewording.
 */
export function mapIntakePayload(
  payload: Record<string, unknown>
): Record<string, string | null> {
  const lookup = new Map<string, string>();
  for (const f of ONBOARDING_FIELDS) {
    lookup.set(norm(f.label), f.column);
    lookup.set(norm(f.column), f.column);
    for (const a of f.aliases ?? []) lookup.set(norm(a), f.column);
  }

  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    const col = lookup.get(norm(key));
    if (!col) continue;
    const str =
      value === null || value === undefined ? null : String(value).trim();
    out[col] = str && str.length > 0 ? str : null;
  }
  return out;
}

/**
 * Build the grouped onboarding Q&A block that becomes Claude's user message.
 * A header per part, then "Label:\nAnswer" lines. Fields with no answer are
 * skipped, so a client who came through the GHL form and one who came through
 * the native form both produce a clean block with no empty scaffolding.
 */
export function buildOnboardingBlock(
  responses: Record<string, unknown>
): string {
  const parts: string[] = [
    "Here are the client's onboarding answers. Write their strategy from these answers up.",
    "",
  ];

  for (const group of GROUP_ORDER) {
    const fields = ONBOARDING_FIELDS.filter((f) => f.group === group);
    const answered = fields.filter((f) => {
      const v = responses[f.column];
      return v !== null && v !== undefined && String(v).trim().length > 0;
    });
    if (answered.length === 0) continue;

    parts.push(`## ${group}`);
    for (const f of answered) {
      parts.push(`${f.label}:`);
      parts.push(String(responses[f.column]).trim());
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}
