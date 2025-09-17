import * as React from "react";
import type { SVGProps } from "react";

export const FacebookIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M16.338 15.543h-2.796v8.385C14.195 23.79,14.853 24,15.5 24c1.491 0,1.956-.925,1.956-1.874v-2.25h-3.328l.532-3.47h2.796zM9.078 12.073h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385c.5.1,1,.1,1.5,.1 4.473,0 8.845-2.4,10-7.5 1-4-1-8-5-9-4-1-8,1-9,5v.5h-3.047v3.47z"/>
  </svg>
);