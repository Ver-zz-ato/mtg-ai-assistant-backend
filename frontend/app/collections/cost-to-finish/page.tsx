// Server component wrapper so we can control dynamic/static flags cleanly.
import Client from "./Client";

export const dynamic = "force-dynamic";
// omit revalidate entirely (the page is dynamic)

export default function Page() {
  return <Client />;
}
