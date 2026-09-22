/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock('@/components/scenarios/CopyShareLink', () => ({
  CopyShareLink: () => <button type="button">Share</button>,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { EditScenarioClient } from '../EditScenarioClient';

const scenario = {
  id: 'scenario-1',
  title: 'Lease renewal',
  description: 'Renew a commercial lease.',
  visibility: 'unlisted' as const,
  joinCode: 'LEASE123',
  learnerRoleId: 'tenant',
  roles: [
    { id: 'tenant', name: 'Tenant', description: 'Keep costs down.' },
    { id: 'landlord', name: 'Landlord', description: 'Protect value.' },
  ],
  personas: [{
    id: 'persona-1',
    name: 'Lou the Landlord',
    description: 'Firm but fair.',
    initialGreeting: 'Let us discuss the rent.',
    roleType: 'Landlord',
    roleId: 'landlord',
  }],
  issues: [{
    name: 'Monthly rent',
    unit: 'USD',
    learnerWants: 'lower' as const,
    learner: { target: 1500, reservation: 1700, weight: 100 },
    counterpart: { target: 1800, reservation: 1600, weight: 100 },
  }],
};

describe('EditScenarioClient Slice 13 acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  it('adds and removes Issues, edits the Persona, and persists both payloads', async () => {
    render(<EditScenarioClient scenario={scenario} />);

    expect(screen.getByTestId('issue-0-name')).toHaveValue('Monthly rent');
    expect(screen.getByTestId('persona-0-name')).toHaveValue('Lou the Landlord');

    fireEvent.click(screen.getByTestId('add-issue'));
    fireEvent.change(screen.getByTestId('issue-1-name'), { target: { value: 'Delivery date' } });
    fireEvent.change(screen.getByTestId('issue-1-unit'), { target: { value: 'days' } });
    fireEvent.click(screen.getByTestId('remove-issue-0'));

    fireEvent.change(screen.getByTestId('persona-0-name'), { target: { value: 'Morgan the Owner' } });
    fireEvent.change(screen.getByTestId('persona-0-description'), { target: { value: 'Patient and exacting.' } });
    fireEvent.change(screen.getByTestId('persona-0-greeting'), { target: { value: 'Show me a workable proposal.' } });
    fireEvent.click(screen.getByTestId('edit-save'));

    await waitFor(() => expect(screen.getByTestId('edit-saved')).toBeInTheDocument());

    const scenarioCall = mockFetch.mock.calls.find(([url]) => url === '/api/scenarios/scenario-1');
    expect(scenarioCall).toBeDefined();
    expect(JSON.parse(scenarioCall![1].body)).toEqual(expect.objectContaining({
      issues: [expect.objectContaining({ name: 'Delivery date', unit: 'days' })],
    }));

    const personaCall = mockFetch.mock.calls.find(([url]) => url === '/api/personas/persona-1');
    expect(personaCall).toBeDefined();
    expect(JSON.parse(personaCall![1].body)).toEqual(expect.objectContaining({
      name: 'Morgan the Owner',
      description: 'Patient and exacting.',
      initialGreeting: 'Show me a workable proposal.',
    }));
    expect(refresh).toHaveBeenCalled();
  });
});
