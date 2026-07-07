import Directory from "@/components/Directory";
import GenerateForm from "@/components/GenerateForm";

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="max-w-2xl space-y-5">
        <h1 className="text-4xl font-bold leading-tight tracking-tighter">
          A curated <span className="font-mono">llms.txt</span>
          <br />
          for any website.
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          The crawler reads the site&apos;s sitemap and key pages, Claude organizes them
          into a spec-compliant file, and the built-in monitor keeps it current as the
          site changes.
        </p>
        <GenerateForm />
      </section>

      <Directory />
    </div>
  );
}
