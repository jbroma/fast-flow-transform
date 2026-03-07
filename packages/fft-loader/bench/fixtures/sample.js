// @flow

import type {User} from './types';

enum Status {
  Ready,
  Busy,
  Paused,
}

type Props = {
  +name: string,
  +status: Status,
};

function identity<T>(value: T): T {
  return value;
}

export function render(user: User, props: Props): string {
  const local: string = identity(props.name);
  switch (props.status) {
    case Status.Ready:
      return `${local}:${user.id}`;
    case Status.Busy:
      return `${local}:busy`;
    default:
      return `${local}:unknown`;
  }
}
