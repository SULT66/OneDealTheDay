"use client";

import Link from "next/link";
import type {ComponentProps} from "react";
import {useNavigationProgress} from "./NavigationProgress";

export function ProgressLink(props: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & {href: string}) {
  const {navigate} = useNavigationProgress();
  return <Link {...props} onNavigate={event => {
    event.preventDefault();
    navigate(props.href, {replace: props.replace, scroll: props.scroll});
  }}/>;
}
