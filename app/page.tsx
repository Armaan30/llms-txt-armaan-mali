import Directory from "@/components/Directory";
import GenerateForm from "@/components/GenerateForm";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 pt-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Generate an{" "}
          <span className="font-mono text-indigo-600 dark:text-indigo-400">llms.txt</span>{" "}
          for any website
        </h1>
        <p className="mx-auto max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
          Enter a URL. The crawler reads the site&apos;s sitemap and key pages, Claude
          organizes them into a spec-compliant llms.txt, and the file stays up to date as
          the site changes.
        </p>
        <div className="mx-auto max-w-xl text-left">
          <GenerateForm />
        </div>
      </section>

      <Directory />
    </div>
  );
}
