export function pointDistance(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}
export function pointEquals(p1, p2) {
    return p1[0] === p2[0] && p1[1] === p2[1];
}
export function pointSub(p1, p2) {
    return [
        p1[0] - p2[0],
        p1[1] - p2[1],
    ];
}
export function pointAdd(p1, p2) {
    return [
        p1[0] + p2[0],
        p1[1] + p2[1],
    ];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9pbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR0EsTUFBTSxVQUFVLGFBQWEsQ0FBQyxFQUFXLEVBQUUsRUFBVztJQUNsRCxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3pCLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ3hDLENBQUM7QUFFRCxNQUFNLFVBQVUsV0FBVyxDQUFDLEVBQVcsRUFBRSxFQUFXO0lBQ2hELE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlDLENBQUM7QUFFRCxNQUFNLFVBQVUsUUFBUSxDQUFDLEVBQVcsRUFBRSxFQUFXO0lBQzdDLE9BQU87UUFDSCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0tBQ2hCLENBQUM7QUFDTixDQUFDO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxFQUFXLEVBQUUsRUFBVztJQUM3QyxPQUFPO1FBQ0gsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztLQUNoQixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlxuZXhwb3J0IHR5cGUgUG9pbnQyRCA9IFtudW1iZXIsIG51bWJlcl07XG5cbmV4cG9ydCBmdW5jdGlvbiBwb2ludERpc3RhbmNlKHAxOiBQb2ludDJELCBwMjogUG9pbnQyRCk6IG51bWJlciB7XG4gICAgY29uc3QgZHggPSBwMVswXSAtIHAyWzBdO1xuICAgIGNvbnN0IGR5ID0gcDFbMV0gLSBwMlsxXTtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvaW50RXF1YWxzKHAxOiBQb2ludDJELCBwMjogUG9pbnQyRCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBwMVswXSA9PT0gcDJbMF0gJiYgcDFbMV0gPT09IHAyWzFdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRTdWIocDE6IFBvaW50MkQsIHAyOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgcDFbMF0gLSBwMlswXSxcbiAgICAgICAgcDFbMV0gLSBwMlsxXSxcbiAgICBdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRBZGQocDE6IFBvaW50MkQsIHAyOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgcDFbMF0gKyBwMlswXSxcbiAgICAgICAgcDFbMV0gKyBwMlsxXSxcbiAgICBdO1xufVxuIl19