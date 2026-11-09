package io.maretha.webui.server;

import org.nuxeo.ecm.core.work.AbstractWork;

/** WorkManager owns scheduling and concurrency; the job's KV state owns cancellation and publication. */
public class DeliveryBulkWork extends AbstractWork {
    private static final long serialVersionUID = 1L;
    protected final String jobId;
    public DeliveryBulkWork(String jobId) {
        super(DeliveryBulkService.CATEGORY + ":" + jobId);
        this.jobId = jobId;
    }
    @Override public String getCategory() { return DeliveryBulkService.CATEGORY; }
    @Override public String getTitle() { return "Prepare authenticated ZIP download"; }
    @Override public void work() {
        // Repository transactions are opened only around capture/permission checks, not compression/transfer.
        commitOrRollbackTransaction();
        new DeliveryBulkService().perform(jobId, this::isSuspending);
    }
}
