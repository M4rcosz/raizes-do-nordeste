import { UserRole } from '@modules/identity/domain/value-objects/user-role';

/**
 * The authenticated principal the chat use case acts on behalf of, built by the
 * controller from the JWT. Tools scope every read to this actor, so the model can
 * never reach data the caller could not fetch through the normal HTTP routes.
 */
export interface ActorContext {
  userId: string;
  role: UserRole;
  businessUnitIds: string[];
}
