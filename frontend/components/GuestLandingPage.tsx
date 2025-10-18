import InlineSignUpForm from './InlineSignUpForm';
import FeatureCard from './FeatureCard';

interface Feature {
  icon: string;
  title: string;
  description: string;
  highlight?: boolean;
}

interface GuestLandingPageProps {
  title: string;
  subtitle: string;
  features: Feature[];
  demoSection?: React.ReactNode;
}

export default function GuestLandingPage({
  title,
  subtitle,
  features,
  demoSection,
}: GuestLandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            {title}
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Demo Section (if provided) */}
        {demoSection && (
          <div className="mb-16">
            {demoSection}
          </div>
        )}

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              highlight={feature.highlight}
            />
          ))}
        </div>

        {/* Sign Up CTA */}
        <div className="max-w-2xl mx-auto">
          <InlineSignUpForm />
        </div>

        {/* Trust Signals */}
        <div className="text-center mt-12">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Join thousands of Magic: The Gathering players
          </p>
          <div className="flex justify-center gap-8 text-xs text-gray-500 dark:text-gray-500">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Free Forever</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>No Credit Card Required</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Pro Features Available</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

