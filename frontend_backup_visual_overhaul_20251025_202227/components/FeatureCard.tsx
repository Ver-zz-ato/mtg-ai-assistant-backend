interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  highlight?: boolean;
}

export default function FeatureCard({ 
  icon, 
  title, 
  description, 
  highlight = false 
}: FeatureCardProps) {
  return (
    <div
      className={`
        rounded-xl p-6 transition-all duration-200 hover:scale-105
        ${
          highlight
            ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white shadow-lg'
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
        }
      `}
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3
        className={`text-xl font-bold mb-2 ${
          highlight ? 'text-white' : 'text-gray-900 dark:text-white'
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-sm ${
          highlight ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {description}
      </p>
    </div>
  );
}

