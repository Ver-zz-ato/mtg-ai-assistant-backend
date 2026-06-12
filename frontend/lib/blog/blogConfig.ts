/** Supabase app_config keys for DB-published blogs. */
export const BLOG_LISTING_KEY = "blog";
export const BLOG_BODIES_KEY = "blog_marketing_bodies";

export const BLOG_CATEGORIES = [
  "Announcement",
  "Budget Building",
  "Strategy",
  "Commander",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogListingEntry = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  gradient: string;
  icon: string;
  imageUrl?: string;
};

export type PublishBlogPostInput = {
  slug: string;
  content: string;
  metadata: Partial<BlogListingEntry> & { title: string };
};
