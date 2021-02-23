// @ts-nocheck

import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import uPlotSeriesBarPlugin from "./broken_uPlotSeriesBarPlugin";
import { Observable } from "./observable";
import unwrap from "ts-unwrap";
import "uplot/dist/uPlot.min.css";

export function SignalBarChart({
  labels,
  data,
}: {
  labels: string[];
  data: Observable<number[][]>;
}) {
  const [dat] = data.useState();
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
      chartRef.current.setData(dat as any);
      //   console.log("setData", dat);
    } else if (container && !chartRef.current) {
      const uplot = (chartRef.current = new uPlot(
        {
          width: 600,
          height: 400,

          series: [
            {},
            ...(labels ?? []).map((label, i) => ({
              label,
              stroke: VEGA_CAT_10_COLORS[i % VEGA_CAT_10_COLORS.length],
            })),
          ],

          axes: [
            {
              //   stroke: "white",
              //   labelSize: 0,
              //   grid: { stroke: "white", width: 0.1 },
              //   ticks: { show: false, size: 0 },
              //   size: 0,
              //   values: "",
            },
            {
              //   stroke: "white",
              //   grid: { stroke: "white", width: 0.1 },
              //   ticks: { show: false },
              show: false,
            },
          ],
          plugins: [
            uPlotSeriesBarPlugin({
              labels: () => labels,
              ori: 1,
              dir: 1,
            }),
          ],
        },
        dat as any, // uPlot.js types incorrect here
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
  }, [containerRef, dat, labels]);

  return <div ref={containerRef} />;
}
