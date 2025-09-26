export function validateFileMime(mimetype: string) {
  return !!mimetype.match(/image\/(?:gif|png|jpeg|jpg)|video\/(?:mov|mp4|pdf)/);
}
