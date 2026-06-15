import HomepageFAQ from "@/components/HomepageFAQ";

export default function HomeFaqSection() {
  return (
    <div className="mt-8 sm:mt-10">
      <HomepageFAQ defaultCollapsed compact maxItems={5} />
    </div>
  );
}
