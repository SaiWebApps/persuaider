'use client';

interface PersonaCardProps {
  persona: {
    id: string;
    name: string;
    description: string;
    roleType: string;
  };
  status: 'available' | 'in_progress' | 'completed';
  onClick: () => void;
}

export function PersonaCard({ persona, status, onClick }: PersonaCardProps) {
  const statusConfig = {
    available: {
      color: 'bg-green-100 text-green-800 border-green-300',
      label: 'Available',
      clickable: true,
    },
    in_progress: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      label: 'In Progress',
      clickable: true,
    },
    completed: {
      color: 'bg-blue-100 text-blue-800 border-blue-300',
      label: 'Completed',
      clickable: true,
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`
        bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border-2 transition-all
        ${config.clickable ? 'cursor-pointer hover:shadow-lg hover:scale-105' : 'opacity-75 cursor-not-allowed'}
        ${config.color}
      `}
      data-testid="persona-card"
      data-status={status}
      onClick={config.clickable ? onClick : undefined}
    >
      {/* Avatar */}
      <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-600 relative">
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-white text-6xl font-bold">
            {persona.name.charAt(0)}
          </div>
        </div>

        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color} bg-white/90 dark:bg-gray-900/90`}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
          {persona.name}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-3">
          {persona.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {persona.roleType}
          </span>

          {config.clickable && (
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors">
              {status === 'completed' ? 'View Summary' : status === 'in_progress' ? 'Continue' : 'Start'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
