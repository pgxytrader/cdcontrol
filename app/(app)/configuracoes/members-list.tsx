import { Badge } from '@/components/ui/badge'
import type { HouseholdMember } from '@/lib/household'

export function MembersList({ members, currentUserId }: { members: HouseholdMember[]; currentUserId: string }) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center justify-between gap-3 py-3">
          <span className="min-w-0 truncate">
            {member.displayName ?? 'Sem nome'}
            {member.userId === currentUserId ? <span className="text-muted-foreground"> (você)</span> : null}
          </span>
          <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
            {member.role === 'owner' ? 'Dono(a)' : 'Membro'}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
