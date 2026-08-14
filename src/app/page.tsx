import LiveValue from './components/MetricCard/LiveValue';
import MetricCard from './components/MetricCard/MetricCard';

const FAKE_METRICS_GRID = [
  {
    title: 'Total users',
    metricName: 'userCount',
  },
  {
    title: 'Total sales',
    metricName: 'sales',
  },
  {
    title: 'Total error rate',
    metricName: 'errorRate',
  },
];
export default function Home() {
  return (
    <main>
      <section className="grid grid-cols-3 gap-4">
        {FAKE_METRICS_GRID.map((metric, index) => {
          return (
            <MetricCard key={index} title={metric.title}>
              <LiveValue metricName={metric.metricName} />
            </MetricCard>
          );
        })}
      </section>
    </main>
  );
}
