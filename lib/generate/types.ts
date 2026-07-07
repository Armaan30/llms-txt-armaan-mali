/** The structured plan an llms.txt is rendered from. */
export interface LlmsTxtPlan {
  siteName: string;
  /** One-paragraph summary — becomes the blockquote. */
  summary: string;
  sections: PlanSection[];
}

export interface PlanSection {
  /** H2 title, e.g. "Documentation". "Optional" has special spec semantics. */
  title: string;
  links: PlanLink[];
}

export interface PlanLink {
  url: string;
  title: string;
  description: string;
}
