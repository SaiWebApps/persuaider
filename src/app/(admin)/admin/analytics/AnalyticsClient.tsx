'use client';

import { useEffect, useState } from 'react';

interface GateData {
  learnersCompleted: number;
  learnersFeltReal: number;
  feltRealAnswers: number;
  targetLearners: number;
  targetFeltReal: number;
}

interface OverviewData {
  totalConversations: number;
  completedConversations: number;
  completionRate: number;
  averageScore: number | null;
}

interface WeekScore {
  week: string;
  avgScore: number;
  count: number;
}

interface PerUserData {
  userId: string;
  username: string;
  totalConversations: number;
  completedConversations: number;
  averageScore: number | null;
}

interface PerScenarioData {
  scenarioId: string;
  title: string;
  totalConversations: number;
  completedConversations: number;
  averageScore: number | null;
}

interface AnalyticsData {
  overview: OverviewData;
  gate?: GateData;
  scoresOverTime: WeekScore[];
  perUser: PerUserData[];
  perScenario: PerScenarioData[];
}

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div data-testid="analytics-loading" className="flex justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="analytics-error" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div data-testid="analytics-dashboard" className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>

      {data.gate && (
        <div data-testid="engine-gate" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Engine gate</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No simulation work until ten learners complete a session and five say the opponent felt real.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Learners who completed a session</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="gate-completed">{data.gate.learnersCompleted} / {data.gate.targetLearners}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Said the opponent felt real (4–5)</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="gate-felt-real">{data.gate.learnersFeltReal} / {data.gate.targetFeltReal}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Answers collected</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="gate-answers">{data.gate.feltRealAnswers}</p>
            </div>
          </div>
        </div>
      )}

      <div data-testid="overview-cards" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Conversations</p>
          <p data-testid="total-conversations" className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {data.overview.totalConversations}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Completion Rate</p>
          <p data-testid="completion-rate" className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {(data.overview.completionRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Average Score</p>
          <p data-testid="average-score" className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {data.overview.averageScore !== null ? data.overview.averageScore.toFixed(1) : 'N/A'}
          </p>
        </div>
      </div>

      <div data-testid="scores-over-time" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scores Over Time</h3>
        {data.scoresOverTime.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No score data available yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 text-gray-600 dark:text-gray-400">Week</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Avg Score</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.scoresOverTime.map((row) => (
                <tr key={row.week} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-gray-900 dark:text-gray-100">{row.week}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.avgScore}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div data-testid="per-user-stats" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Per User</h3>
        {data.perUser.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No user data available.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 text-gray-600 dark:text-gray-400">Username</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Conversations</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Completed</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {data.perUser.map((row) => (
                <tr key={row.userId} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-gray-900 dark:text-gray-100">{row.username}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.totalConversations}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.completedConversations}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.averageScore !== null ? row.averageScore : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div data-testid="per-scenario-stats" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Per Scenario</h3>
        {data.perScenario.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No scenario data available.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 text-gray-600 dark:text-gray-400">Scenario</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Conversations</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Completed</th>
                <th className="text-right py-2 text-gray-600 dark:text-gray-400">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {data.perScenario.map((row) => (
                <tr key={row.scenarioId} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-gray-900 dark:text-gray-100">{row.title}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.totalConversations}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.completedConversations}</td>
                  <td className="py-2 text-right text-gray-900 dark:text-gray-100">{row.averageScore !== null ? row.averageScore : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}