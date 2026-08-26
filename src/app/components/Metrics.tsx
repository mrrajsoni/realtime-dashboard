import LiveValue from './MetricCard/LiveValue';
import MetricCard from './MetricCard/MetricCard';

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
const Metrics = () => {
  return (
    <section className="grid grid-cols-3 gap-4">
      {FAKE_METRICS_GRID.map((metric, index) => {
        return (
          <MetricCard key={index} title={metric.title}>
            <LiveValue metricName={metric.metricName} />
          </MetricCard>
        );
      })}
    </section>
  );
};

export default Metrics;
