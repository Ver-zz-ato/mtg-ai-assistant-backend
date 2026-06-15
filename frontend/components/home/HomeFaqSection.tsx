import HomepageFAQ from "@/components/HomepageFAQ";

export default function HomeFaqSection() {
  return (
    <div className="mt-5 sm:mt-6">
      <HomepageFAQ defaultCollapsed compact maxItems={5} />
    </div>
  );
}
