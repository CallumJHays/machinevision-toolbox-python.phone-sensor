import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import { Observable } from "./observable";
import unwrap from "ts-unwrap";
import "uplot/dist/uPlot.min.css";

export type SignalScope = {
  name: string;
  styles: string | {} | null;
  labels: string[] | null;
  data: Observable<number[][]>;

  // millliseconds of data to retain and display -
  // prevents memory usage from growing indefinitely
  keepLastSecs: number;
};

export function SignalScopeChart({ scope }: { scope: SignalScope }) {
  const [data] = scope.data.useState();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot>();

  // update the chart
  useEffect(() => {
    // use the same modern matplotlib default colours
    const VEGA_CAT_10_COLORS = [
      "#1f77b4",
      "#ff7f0e",
      "#2ca02c",
      "#d62728",
      "#9467bd",
      "#8c564b",
      "#e377c2",
      "#7f7f7f",
      "#bcbd22",
      "#17becf",
    ];

    const container = containerRef.current;
    if (chartRef.current) {
      chartRef.current.setData(data as any);
      //   console.log("setData", data);
    } else if (container && !chartRef.current) {
      const uplot = (chartRef.current = new uPlot(
        {
          width: 600,
          height: 400,

          series: [
            {},
            ...(scope.labels ?? []).map((label, i) => ({
              label,
              stroke: VEGA_CAT_10_COLORS[i % VEGA_CAT_10_COLORS.length],
            })),
          ],

          axes: [
            {
              stroke: "white",
              labelSize: 0,
              grid: { stroke: "white", width: 0.1 },
              ticks: { show: false },
              size: 0,
            },
            {
              stroke: "white",
              grid: { stroke: "white", width: 0.1 },
              ticks: { show: false },
            },
          ],
        },
        data as any, // uPlot.js types incorrect here
        container
      ));
      const parent = unwrap(container.parentElement);

      new ResizeObserver(() => {
        const LEGEND_HEIGHT = 25;
        uplot.setSize({
          width: parent.offsetWidth,
          height: parent.offsetHeight - LEGEND_HEIGHT,
        });
      }).observe(parent);
    }
  }, [containerRef, data, scope.labels]);

  return <div ref={containerRef} />;
}
