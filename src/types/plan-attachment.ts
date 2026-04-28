export interface PlanAttachment {
  id: string;
  planId: string;
  filename: string;
  contentType?: string;
  sizeBytes: number;
  relativePath: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlanAttachmentTempFile {
  attachment: PlanAttachment;
  tempPath: string;
}
